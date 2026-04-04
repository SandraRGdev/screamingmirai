---
title: "Phase 2: BFS Crawler Core"
description: "Implement BFS crawler with queue, visited set, fetcher, and Cheerio parser"
status: pending
priority: P1
effort: 6h
branch: feature/bfs-crawler
version: v0.2.0
tags: [crawler, bfs, cheerio, typescript]
created: 2026-04-04
---

# Phase 2: BFS Crawler Core

## Context

**Related Reports:**
- `researcher-crawler-architecture-report.md` — Sections 1-5 (BFS algorithm, Cheerio, URL filtering)
- `researcher-screaming-web-full-report.md` — Section 6 (BFS Crawler Architecture)

**Overview:**
Implement the core BFS crawler engine with queue management, URL normalization, link extraction, and Cheerio-based HTML parsing. This is the heart of the application.

## Key Insights

1. BFS guarantees shallow pages are crawled first (mirrors search engines)
2. `Set<string>` for visited URLs provides O(1) deduplication
3. URL normalization prevents duplicate crawls (trailing slashes, fragments)
4. Extension filtering before fetch saves bandwidth
5. Content-Type verification after fetch catches non-HTML responses

## Requirements

### Functional Requirements
- BFS traversal from seed URL
- Configurable `maxDepth` and `maxPages`
- URL normalization (strip fragment, lowercase host)
- File extension blocking (images, CSS, JS, PDFs, etc.)
- Same-domain only filtering
- Cheerio HTML parsing
- Extract: title, canonical, meta robots, links

### Non-Functional Requirements
- Single crawler instance (no concurrency yet)
- In-memory state only
- Each file under 200 lines

## Architecture

### Data Flow

```
seedUrl → normalize → queue.push({url, depth: 0})
          ↓
while queue not empty:
  item = queue.shift()
  if visited or blocked: continue
  fetch(url)
  if not text/html: continue
  parse with Cheerio
  extract links
  normalize + filter each link
  queue.push({url, depth: item.depth + 1})
```

### Module Structure

```
crawler/
├── bfs.ts           # BFS queue manager & generator
├── fetcher.ts       # HTTP fetch + content-type check
├── parser.ts        # Cheerio HTML parsing
├── url-utils.ts     # URL normalization, filtering
└── types.ts         # Crawler-specific types
```

## Related Code Files

### Files to Create
- `crawler/bfs.ts`
- `crawler/fetcher.ts`
- `crawler/parser.ts`
- `crawler/url-utils.ts`
- `crawler/types.ts`
- `lib/types.ts` (extend with crawler types)

### Files to Modify
- None (new module)

## Implementation Steps

1. **Create crawler types** — `crawler/types.ts`:
   ```ts
   export interface QueueItem {
     url: string;
     depth: number;
     discoveredFrom: string | null;
   }

   export interface CrawlerConfig {
     seedUrl: string;
     maxDepth: number;
     maxPages: number;
     userAgent: string;
     sameDomainOnly: boolean;
     blockedExtensions: Set<string>;
   }

   export interface FetchResult {
     html: string;
     status: number;
     contentType: string;
     url: string;
   }

   export interface ParsedResult {
     url: string;
     status: number;
     contentType: string;
     depth: number;
     title: string | null;
     canonical: string | null;
     metaRobots: string | null;
     internalLinks: string[];
     externalLinks: string[];
   }
   ```

2. **Create URL utilities** — `crawler/url-utils.ts`:
   ```ts
   import { QueueItem } from './types';

   export function normalizeUrl(url: string): string {
     try {
       const parsed = new URL(url);
       parsed.hash = '';
       const normalized = parsed.href;
       return normalized.endsWith('/')
         ? normalized.slice(0, -1)
         : normalized;
     } catch {
       return url;
     }
   }

   export function isSameDomain(url: string, seedDomain: string): boolean {
     try {
       return new URL(url).hostname === seedDomain;
     } catch {
       return false;
     }
   }

   export function isBlockedExtension(
     url: string,
     blocked: Set<string>
   ): boolean {
     const pathname = new URL(url).pathname.toLowerCase();
     const ext = pathname.substring(pathname.lastIndexOf('.'));
     return ext && blocked.has(ext);
   }

   export function getDomain(url: string): string {
     return new URL(url).hostname;
   }
   ```

3. **Create fetcher** — `crawler/fetcher.ts`:
   ```ts
   import type { FetchResult } from './types';

   const DEFAULT_TIMEOUT = 15000;

   export async function fetchPage(
     url: string,
     userAgent: string = 'ScreamingWeb/1.0'
   ): Promise<FetchResult | null> {
     try {
       const response = await fetch(url, {
         headers: { 'User-Agent': userAgent },
         signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
       });

       const contentType = response.headers.get('content-type') || '';

       // Only process HTML
       if (!contentType.includes('text/html')) {
         return null;
       }

       const html = await response.text();

       return {
         html,
         status: response.status,
         contentType,
         url: response.url, // Follows redirects
       };
     } catch {
       return null;
     }
   }
   ```

4. **Create parser** — `crawler/parser.ts`:
   ```ts
   import * as cheerio from 'cheerio';
   import type { FetchResult, ParsedResult } from './types';
   import { normalizeUrl } from './url-utils';

   export function parseHtml(
     result: FetchResult,
     depth: number,
     seedDomain: string
   ): ParsedResult {
     const $ = cheerio.load(result.html);

     const title = $('title').text().trim() || null;
     const canonical =
       $('link[rel="canonical"]').attr('href') || null;
     const metaRobots =
       $('meta[name="robots"]').attr('content') || null;

     const internalLinks: string[] = [];
     const externalLinks: string[] = [];

     $('a[href]').each((_, el) => {
       const href = $(el).attr('href');
       if (!href) return;

       // Skip non-http links
       if (
         href.startsWith('javascript:') ||
         href.startsWith('mailto:') ||
         href.startsWith('tel:') ||
         href === '#'
       ) {
         return;
       }

       try {
         const absolute = new URL(href, result.url).href;
         const normalized = normalizeUrl(absolute);

         if (new URL(normalized).hostname === seedDomain) {
           internalLinks.push(normalized);
         } else {
           externalLinks.push(normalized);
         }
       } catch {
         // Invalid URL, skip
       }
     });

     return {
       url: result.url,
      status: result.status,
      contentType: result.contentType,
      depth,
      title,
      canonical,
      metaRobots,
      internalLinks: [...new Set(internalLinks)],
      externalLinks: [...new Set(externalLinks)],
    };
   }

  export function isIndexable(metaRobots: string | null): boolean {
    if (!metaRobots) return true;
    const lower = metaRobots.toLowerCase();
    return !lower.includes('noindex') && !lower.includes('none');
  }
   ```

5. **Create BFS crawler** — `crawler/bfs.ts`:
   ```ts
   import type { CrawlerConfig, ParsedResult } from './types';
   import { normalizeUrl, isSameDomain, isBlockedExtension, getDomain } from './url-utils';
   import { fetchPage } from './fetcher';
   import { parseHtml } from './parser';

   export async function* crawlGenerator(
     config: CrawlerConfig
   ): AsyncGenerator<ParsedResult> {
     const queue: Array<{ url: string; depth: number; discoveredFrom: string | null }> = [
       { url: normalizeUrl(config.seedUrl), depth: 0, discoveredFrom: null },
     ];

     const visited = new Set<string>();
     const seedDomain = getDomain(config.seedUrl);

     while (queue.length > 0 && visited.size < config.maxPages) {
       const item = queue.shift()!;
       const normalized = normalizeUrl(item.url);

       if (visited.has(normalized)) continue;
       if (item.depth > config.maxDepth) continue;
       if (config.sameDomainOnly && !isSameDomain(normalized, seedDomain)) continue;
       if (isBlockedExtension(normalized, config.blockedExtensions)) continue;

       visited.add(normalized);

       const fetchResult = await fetchPage(normalized, config.userAgent);
       if (!fetchResult) continue;

       const parsed = parseHtml(fetchResult, item.depth, seedDomain);

       yield parsed;

       // Queue internal links
       for (const link of parsed.internalLinks) {
         const linkNormalized = normalizeUrl(link);
         if (!visited.has(linkNormalized)) {
           queue.push({
             url: linkNormalized,
             depth: item.depth + 1,
             discoveredFrom: normalized,
           });
         }
       }
     }
   }

   export function createConfig(partial: Partial<CrawlerConfig> = {}): CrawlerConfig {
     return {
       seedUrl: partial.seedUrl || 'https://example.com',
       maxDepth: partial.maxDepth ?? 3,
       maxPages: partial.maxPages ?? 500,
       userAgent: partial.userAgent || 'ScreamingWeb/1.0',
       sameDomainOnly: partial.sameDomainOnly ?? true,
       blockedExtensions: partial.blockedExtensions || new Set([
         '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
         '.css', '.js', '.mjs',
         '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
         '.mp3', '.mp4', '.avi', '.mov', '.wmv',
         '.zip', '.tar', '.gz', '.rar',
         '.woff', '.woff2', '.ttf', '.eot',
         '.json', '.xml', '.rss', '.atom',
       ]),
     };
   }
   ```

6. **Export crawler module** — `crawler/index.ts`:
   ```ts
   export * from './types';
   export * from './bfs';
   export * from './fetcher';
   export * from './parser';
   export * from './url-utils';
   ```

7. **Add unit tests** — `crawler/__tests__/url-utils.test.ts`:
   ```ts
   import { describe, it, expect } from '@jest/globals';
   import { normalizeUrl, isSameDomain, isBlockedExtension } from '../url-utils';

   describe('normalizeUrl', () => {
     it('removes fragments', () => {
       expect(normalizeUrl('https://example.com#section')).toBe('https://example.com');
     });

     it('removes trailing slash', () => {
       expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
     });

     it('lowercases hostname', () => {
       expect(normalizeUrl('https://EXAMPLE.COM')).toBe('https://example.com');
     });
   });

   describe('isSameDomain', () => {
     it('returns true for same domain', () => {
       expect(isSameDomain('https://example.com/page', 'example.com')).toBe(true);
     });

     it('returns false for different domain', () => {
       expect(isSameDomain('https://other.com/page', 'example.com')).toBe(false);
     });
   });
   ```

8. **Update TypeScript config** — Add paths:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./*"]
       }
     }
   }
   ```

## Success Criteria

- [ ] BFS crawler visits URLs in depth order
- [ ] URL normalization prevents duplicates
- [ ] Extension blocking skips non-HTML files
- [ ] Cheerio extracts title, canonical, meta robots
- [ ] Link extraction finds internal/external links
- [ ] Generator yields results as they're crawled
- [ ] All files under 200 lines
- [ ] Unit tests pass

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Memory leak from unbounded queue | Medium | High | Cap at `maxPages` |
| Cheerio parsing errors | Low | Medium | Try/catch around load() |
| URL normalization edge cases | Low | Low | Test with real URLs |

## Rollback Plan

If BFS logic has bugs:
1. Revert `crawler/` directory to previous commit
2. Add more unit tests before retrying
3. Test with small site (10-20 pages)

## Dependencies

- **Blocked by:** Phase 1 (project scaffolding)
- **Blocks:** Phase 3 (hybrid fetch), Phase 4 (API routes)
- **External:** None

## Next Steps

1. Merge `feature/bfs-crawler` → `develop`
2. Tag `v0.2.0` on merge
3. Create `feature/hybrid-fetch` branch
4. Begin Phase 3
