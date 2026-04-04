---
title: "Phase 3: Hybrid Fetch & robots.txt"
description: "Add Playwright fallback for JS pages and robots.txt respect"
status: pending
priority: P1
effort: 5h
branch: feature/hybrid-fetch
version: v0.3.0
tags: [playwright, robots-txt, hybrid-fetch]
created: 2026-04-04
---

# Phase 3: Hybrid Fetch & robots.txt

## Context

**Related Reports:**
- `researcher-docker-playwright-report.md` — Sections 4-7 (Hybrid fetch pattern, browser lifecycle)
- `researcher-crawler-architecture-report.md` — Section 3.3 (robots.txt respect)

**Overview:**
Add Playwright as fallback for JavaScript-rendered pages and implement robots.txt parsing. The hybrid approach tries fast fetch+Cheerio first, falls back to Playwright for empty/JS pages.

## Key Insights

1. Most SEO crawls work with fetch+Cheerio (fast, ~100-500ms)
2. SPAs need Playwright (slow, ~2-8s) — use as fallback only
3. Heuristic: empty body or common SPA mount points = needs Playwright
4. Browser singleton (launch once, reuse) saves ~2s per request
5. `robots-parser` package handles robots.txt with crawl-delay

## Requirements

### Functional Requirements
- Hybrid fetch: try Cheerio first, Playwright fallback
- Detect JS-rendered pages via heuristic
- Configurable "force JS" toggle
- robots.txt fetching and parsing
- Respect robots.txt rules (if enabled)
- Respect crawl-delay from robots.txt

### Non-Functional Requirements
- Browser instance lifecycle managed properly
- Pages closed after use (prevent memory leaks)
- Each file under 200 lines

## Architecture

### Data Flow

```
fetch(url)
  ↓
Content-Type check
  ↓
HTML content heuristic
  ├── Has body content → Parse with Cheerio (fast)
  └── Empty/SPA shell → Playwright fetch (slow)
      ↓
  Browser singleton (reuse)
      ↓
  New page → goto → content() → close page
      ↓
  Parse with Cheerio
```

### Module Structure

```
crawler/
├── playwright.ts      # Browser singleton, page fetching
├── robots.ts          # robots.txt fetching and parsing
├── hybrid-fetcher.ts  # Unified fetcher with fallback logic
└── ...
```

## Related Code Files

### Files to Create
- `crawler/playwright.ts`
- `crawler/robots.ts`
- `crawler/hybrid-fetcher.ts`

### Files to Modify
- `crawler/bfs.ts` — Use hybrid fetcher
- `crawler/types.ts` — Add Playwright types
- `package.json` — Add `playwright` dependency

## Implementation Steps

1. **Install Playwright**
   ```bash
   npm install playwright
   npx playwright install --with-deps chromium
   ```

2. **Create Playwright module** — `crawler/playwright.ts`:
   ```ts
   import { chromium, type Browser, type Page } from 'playwright';

   let browserInstance: Browser | null = null;

   export async function getBrowser(): Promise<Browser> {
     if (!browserInstance || !browserInstance.isConnected()) {
       browserInstance = await chromium.launch({
         headless: true,
         args: [
           '--disable-gpu',
           '--disable-dev-shm-usage',
           '--no-sandbox', // Remove if using SYS_ADMIN in Docker
         ],
       });
     }
     return browserInstance;
   }

   export async function closeBrowser(): Promise<void> {
     if (browserInstance?.isConnected()) {
       await browserInstance.close();
       browserInstance = null;
     }
   }

   export async function fetchWithPlaywright(
     url: string,
     timeout: number = 30000
   ): Promise<{ html: string; status: number; contentType: string } | null> {
     const browser = await getBrowser();
     let page: Page | null = null;

     try {
       page = await browser.newPage();

       // Block unnecessary resources
       await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,css}', (route) =>
         route.abort()
       );

       const response = await page.goto(url, {
         timeout,
         waitUntil: 'domcontentloaded',
       });

       if (!response) return null;

       const html = await page.content();
       const status = response.status();
       const headers = response.headers();
       const contentType = headers['content-type'] || '';

       return { html, status, contentType };
     } catch {
       return null;
     } finally {
       if (page) await page.close();
     }
   }

   // Graceful shutdown
   process.on('SIGTERM', closeBrowser);
   process.on('SIGINT', closeBrowser);
   ```

3. **Create robots.txt module** — `crawler/robots.ts`:
   ```ts
   import robotsParser from 'robots-parser';

   interface RobotsConfig {
     isAllowed: (url: string) => boolean;
     getCrawlDelay: () => number;
   }

   export async function fetchRobotsTxt(
     seedUrl: string,
     userAgent: string = 'ScreamingWeb'
   ): Promise<RobotsConfig> {
     const robotsUrl = new URL('/robots.txt', seedUrl).href;

     try {
       const response = await fetch(robotsUrl, {
         signal: AbortSignal.timeout(10000),
       });

       if (!response.ok) {
         return { isAllowed: () => true, getCrawlDelay: () => 0 };
       }

       const text = await response.text();
       const parser = robotsParser(robotsUrl, text);

       return {
         isAllowed: (url: string) => parser.isAllowed(url, userAgent) ?? true,
         getCrawlDelay: () => parser.getCrawlDelay(userAgent) ?? 0,
       };
     } catch {
       // No robots.txt or error — allow all
       return { isAllowed: () => true, getCrawlDelay: () => 0 };
     }
   }

   export async function withCrawlDelay<T>(
     delayMs: number,
     fn: () => Promise<T>
   ): Promise<T> {
     if (delayMs > 0) {
       await new Promise((resolve) => setTimeout(resolve, delayMs));
     }
     return fn();
   }
   ```

4. **Create hybrid fetcher** — `crawler/hybrid-fetcher.ts`:
   ```ts
   import * as cheerio from 'cheerio';
   import { fetchPage as fetchWithCheerio } from './fetcher';
   import { fetchWithPlaywright } from './playwright';

   export interface FetchResult {
     html: string;
     status: number;
     contentType: string;
     url: string;
     method: 'cheerio' | 'playwright';
   }

   async function isJsRenderedPage(html: string): Promise<boolean> {
     const $ = cheerio.load(html);

     // Check for empty body
     const bodyText = $('body').text().trim();
     if (bodyText.length < 100) return true;

     // Check for common SPA mount points with no children
     const emptyRoot = $('#root').children().length === 0;
     const emptyNext = $('#__next').children().length === 0;
     const emptyApp = $('#app').children().length === 0;

     return emptyRoot || emptyNext || emptyApp;
   }

   export async function hybridFetch(
     url: string,
     options: {
       userAgent?: string;
       forceJs?: boolean;
       timeout?: number;
     } = {}
   ): Promise<FetchResult | null> {
     const { userAgent = 'ScreamingWeb/1.0', forceJs = false } = options;

     // Fast path: try Cheerio first
     if (!forceJs) {
       const cheerioResult = await fetchWithCheerio(url, userAgent);
       if (cheerioResult) {
         const needsJs = await isJsRenderedPage(cheerioResult.html);

         if (!needsJs) {
           return { ...cheerioResult, method: 'cheerio' };
         }
       }
     }

     // Slow path: use Playwright
     const playwrightResult = await fetchWithPlaywright(url, options.timeout);
     if (playwrightResult) {
       return { ...playwrightResult, method: 'playwright' };
     }

     return null;
   }
   ```

5. **Update BFS crawler** — `crawler/bfs.ts`:
   ```ts
   import { hybridFetch } from './hybrid-fetcher';
   import { fetchRobotsTxt, withCrawlDelay } from './robots';

   // Update CrawlerConfig
   export interface CrawlerConfig {
     // ... existing
     useJs: boolean;
     respectRobotsTxt: boolean;
   }

   export async function* crawlGenerator(
     config: CrawlerConfig
   ): AsyncGenerator<ParsedResult> {
     // Fetch robots.txt if enabled
     let robots: Awaited<ReturnType<typeof fetchRobotsTxt>> | null = null;
     if (config.respectRobotsTxt) {
       robots = await fetchRobotsTxt(config.seedUrl, config.userAgent);
     }

     // ... queue setup

     while (queue.length > 0) {
       // ... existing checks

       // Check robots.txt
       if (robots && !robots.isAllowed(normalized)) {
         continue;
       }

       // Respect crawl delay
       if (robots) {
         const delay = robots.getCrawlDelay();
         await withCrawlDelay(delay, async () => {/* continue */});
       }

       const fetchResult = await hybridFetch(normalized, {
         userAgent: config.userAgent,
         forceJs: config.useJs,
       });

       if (!fetchResult) continue;

       // ... rest of parsing logic
     }
   }
   ```

6. **Update types** — `crawler/types.ts`:
   ```ts
   export interface CrawlerConfig {
     seedUrl: string;
     maxDepth: number;
     maxPages: number;
     userAgent: string;
     sameDomainOnly: boolean;
     blockedExtensions: Set<string>;
     useJs: boolean; // NEW
     respectRobotsTxt: boolean; // NEW
   }
   ```

7. **Add Playwright to dev dependencies** — `package.json`:
   ```json
   {
     "dependencies": {
       "playwright": "^1.58.0"
     }
   }
   ```

8. **Create unit tests** — `crawler/__tests__/robots.test.ts`:
   ```ts
   import { describe, it, expect } from '@jest/globals';
   import { fetchRobotsTxt } from '../robots';

   describe('robots.txt', () => {
     it('allows all when no robots.txt', async () => {
       const robots = await fetchRobotsTxt('https://example.com');
       expect(robots.isAllowed('https://example.com/page')).toBe(true);
     });
   });
   ```

## Success Criteria

- [ ] Hybrid fetch uses Cheerio for static pages
- [ ] Playwright launches for JS-rendered pages
- [ ] Browser singleton works across multiple pages
- [ ] robots.txt is fetched and parsed
- [ ] Disallowed URLs are skipped
- [ ] Crawl-delay is respected
- [ ] Browser closes on SIGTERM
- [ ] All files under 200 lines

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Browser not closed (memory leak) | Medium | High | try/finally around page.close() |
| Chromium crashes in container | Medium | Medium | Health check + auto-restart |
| robots.txt blocks everything | Low | Low | User can disable toggle |
| Heuristic misidentifies pages | Low | Low | User can force JS toggle |

## Rollback Plan

If Playwright causes issues:
1. Set `useJs: false` as default
2. Remove Playwright dependency
3. Use Cheerio-only fetcher

## Dependencies

- **Blocked by:** Phase 2 (BFS crawler core)
- **Blocks:** Phase 4 (API routes)
- **External:** None

## Next Steps

1. Merge `feature/hybrid-fetch` → `develop`
2. Tag `v0.3.0` on merge
3. Create `feature/api-streaming` branch
4. Begin Phase 4
