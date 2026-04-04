# Research Report: ScreamingWeb — SEO Crawler Application

**Date:** 2026-04-04
**Topic:** Full-stack SEO crawler (mini Screaming Frog) — Next.js + Playwright + Cheerio + Docker

---

## Executive Summary

This report covers all technical decisions for building a single-project Next.js SEO crawler that discovers internal HTML URLs via BFS. Key findings:

1. **Crawler**: Cheerio for fast HTML parsing (primary), Playwright headless Chromium as fallback for JS-heavy pages. Hybrid fetch pattern with content-type verification.
2. **Real-time UI**: Next.js Route Handlers with `ReadableStream` (SSE-like pattern) for live crawl progress — no WebSockets needed.
3. **Data Table**: TanStack Table (headless) + shadcn/ui `DataTable` component for sorting, filtering, pagination. Handles 100k+ rows client-side.
4. **Docker**: Multi-stage build based on `node:20-bookworm` with Playwright Chromium-only installation. Final image ~800MB-1.2GB (Chromium adds ~400MB).
5. **Deployment**: Dokploy-compatible with Traefik integration, single `docker-compose.yml`, no external dependencies.

---

## 1. Next.js App Router — Route Handlers & Streaming

### Streaming Pattern for Real-Time Crawl Progress

Next.js Route Handlers support `ReadableStream` natively. Use this for SSE-like real-time updates during crawling.

**Route: `/app/api/crawl/route.ts`**

```typescript
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Crawl loop
      for await (const result of crawlGenerator(startUrl, options)) {
        sendEvent({ type: 'url_discovered', data: result });
      }

      sendEvent({ type: 'done', total: results.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Client-side consumption:**

```typescript
const response = await fetch('/api/crawl', {
  method: 'POST',
  body: JSON.stringify({ url, maxDepth, maxPages }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  const lines = text.split('\n').filter(l => l.startsWith('data: '));

  for (const line of lines) {
    const data = JSON.parse(line.slice(6));
    // Update state with new URL data
  }
}
```

### Key Points

- `export const dynamic = 'force-dynamic'` prevents caching
- No WebSockets or third-party libs needed
- Works behind Traefik/Nginx (may need `X-Accel-Buffering: no` header)
- Browser `fetch` + `ReadableStream` is well-supported

---

## 2. TanStack Table + shadcn/ui DataTable

### Setup

```bash
npx shadcn@latest add table
```

This installs `@tanstack/react-table` + shadcn `DataTable` component.

### Column Definition

```typescript
// /lib/columns.ts
import { ColumnDef } from '@tanstack/react-table';

export type CrawledUrl = {
  url: string;
  status: number;
  contentType: string;
  depth: number;
  title: string | null;
  canonical: string | null;
  metaRobots: string | null;
  esIndexable: boolean;
  inlinks: number;
  discoveredFrom: string | null;
};

export const columns: ColumnDef<CrawledUrl>[] = [
  {
    accessorKey: 'url',
    header: 'URL',
    cell: ({ row }) => (
      <a href={row.getValue('url')} target="_blank" className="text-blue-600 truncate max-w-md block">
        {row.getValue('url')}
      </a>
    ),
  },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'depth', header: 'Depth' },
  { accessorKey: 'title', header: 'Title' },
  {
    accessorKey: 'esIndexable',
    header: 'Indexable',
    cell: ({ row }) => (row.getValue('esIndexable') ? '✓' : '✗'),
  },
];
```

### DataTable Component

shadcn/ui provides `DataTable` as a reusable component. Key features:

- **Sorting**: `getSortedRowModel()` — click column headers to sort
- **Filtering**: `getFilteredRowModel()` — global search + column filters
- **Pagination**: `getPaginationRowModel()` — configurable page sizes
- **Row selection**: Built-in checkbox selection
- **Performance**: Virtual scrolling not needed for <50k rows; for larger sets, use `@tanstack/react-virtual`

### Usage

```typescript
const table = useReactTable({
  data: crawledUrls,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  state: { sorting, columnFilters, globalFilter },
  onSortingChange: setSorting,
  onColumnFiltersChange: setColumnFilters,
  onGlobalFilterChange: setGlobalFilter,
});
```

---

## 3. Cheerio — HTML Parsing

### Installation

```bash
npm install cheerio
```

### Key Patterns for Crawler

```typescript
import * as cheerio from 'cheerio';

// Parse HTML string
const $ = cheerio.load(htmlString);

// Extract links
const links: string[] = [];
$('a[href]').each((_, el) => {
  const href = $(el).attr('href');
  if (href) links.push(href);
});

// Extract metadata
const title = $('title').text().trim() || null;
const canonical = $('link[rel="canonical"]').attr('href') || null;
const metaRobots = $('meta[name="robots"]').attr('content') || null;

// Check indexability
function isIndexable(metaRobots: string | null): boolean {
  if (!metaRobots) return true;
  const lower = metaRobots.toLowerCase();
  return !lower.includes('noindex') && !lower.includes('none');
}
```

### Cheerio `fromURL` (Alternative)

```typescript
// Cheerio can fetch URLs directly (since v1.0.0)
const $ = await cheerio.fromURL(url);
```

**But for our use case**, we need more control (status code, headers, content-type check), so we use `fetch` + `cheerio.load()`:

```typescript
const response = await fetch(url);
const contentType = response.headers.get('content-type') || '';
if (!contentType.includes('text/html')) return null; // Skip non-HTML

const html = await response.text();
const $ = cheerio.load(html);
```

---

## 4. Playwright — Headless Scraping Fallback

### Installation (Library Mode, NOT test runner)

```bash
npm install playwright  # NOT @playwright/test
```

### Usage Pattern

```typescript
import { chromium, Browser, BrowserContext } from 'playwright';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

async function fetchWithPlaywright(url: string) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'ScreamingWeb/1.0 Crawler',
    viewport: { width: 1280, height: 720 },
  });

  try {
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    if (!response) return null;

    const html = await page.content();
    const status = response.status();
    const contentType = response.headers()['content-type'] || '';

    return { html, status, contentType };
  } finally {
    await context.close();
  }
}
```

### Resource Interception (Optimization)

Block unnecessary resources to speed up Playwright:

```typescript
await page.route('**/*', (route) => {
  const resourceType = route.request().resourceType();
  if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
    route.abort();
  } else {
    route.continue();
  }
});
```

### Browser Lifecycle

- Launch **one** browser instance at crawl start, reuse across pages
- Create new `BrowserContext` per page (isolated, no cookie leakage)
- Close context after each page, close browser when crawl completes
- In Docker: use `--no-sandbox` flag (Chromium sandbox unavailable in containers)

---

## 5. Hybrid Fetch Pattern (Cheerio + Playwright)

### Strategy

```
fetch(url) → check HTML content
  ├── Valid HTML (non-empty, has <body>) → Parse with Cheerio ✓
  └── Empty/suspicious (JS-heavy SPA) → Re-fetch with Playwright ✓
```

### Implementation

```typescript
async function fetchPage(url: string, useJs: boolean): Promise<FetchResult | null> {
  // Step 1: Try lightweight fetch
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ScreamingWeb/1.0 Crawler' },
      signal: AbortSignal.timeout(15000),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await response.text();

    // Check if HTML looks complete (not JS-rendered empty shell)
    const hasContent = html.includes('<body') && html.length > 500;

    if (hasContent && !useJs) {
      return { html, status: response.status, contentType, method: 'fetch' };
    }

    // If HTML looks empty or user wants JS rendering, fallback to Playwright
    if (!hasContent || useJs) {
      return await fetchWithPlaywright(url);
    }
  } catch {
    // Fetch failed, try Playwright as last resort
    return await fetchWithPlaywright(url);
  }
}
```

### Decision Logic

| Condition | Action |
|-----------|--------|
| `Content-Type` not `text/html` | Skip entirely |
| HTML has `<body>` and >500 chars | Parse with Cheerio |
| HTML is empty shell (SPA) | Use Playwright |
| `useJs` toggle enabled | Always use Playwright |
| `fetch` throws network error | Fallback to Playwright |

---

## 6. BFS Crawler Architecture

### Core Algorithm

```typescript
interface CrawlOptions {
  startUrl: string;
  maxDepth: number;
  maxPages: number;
  useJs: boolean;
}

interface CrawlResult {
  url: string;
  status: number;
  contentType: string;
  depth: number;
  title: string | null;
  canonical: string | null;
  metaRobots: string | null;
  esIndexable: boolean;
  inlinks: number;
  discoveredFrom: string | null;
}

async function* crawlGenerator(
  startUrl: string,
  options: CrawlOptions
): AsyncGenerator<CrawlResult> {
  const visited = new Set<string>();
  const inlinksMap = new Map<string, number>();
  const queue: Array<{ url: string; depth: number; discoveredFrom: string | null }> = [
    { url: normalizeUrl(startUrl), depth: 0, discoveredFrom: null },
  ];

  const baseUrl = new URL(startUrl);
  const blockedExtensions = /\.(jpg|jpeg|png|gif|svg|webp|css|js|json|xml|pdf|zip|rar|woff|woff2|ttf|mp4|webm)(\?|#|$)/i;

  while (queue.length > 0 && visited.size < options.maxPages) {
    const item = queue.shift()!;
    const normalizedUrl = normalizeUrl(item.url);

    if (visited.has(normalizedUrl)) continue;
    if (blockedExtensions.test(normalizedUrl)) continue;
    if (item.depth > options.maxDepth) continue;

    visited.add(normalizedUrl);

    // Fetch & parse
    const result = await fetchPage(normalizedUrl, options.useJs);
    if (!result) continue;

    // Parse with Cheerio
    const $ = cheerio.load(result.html);
    const title = $('title').text().trim() || null;
    const canonical = $('link[rel="canonical"]').attr('href') || null;
    const metaRobots = $('meta[name="robots"]').attr('content') || null;

    const crawlResult: CrawlResult = {
      url: normalizedUrl,
      status: result.status,
      contentType: result.contentType,
      depth: item.depth,
      title,
      canonical,
      metaRobots,
      esIndexable: isIndexable(metaRobots),
      inlinks: inlinksMap.get(normalizedUrl) || 0,
      discoveredFrom: item.discoveredFrom,
    };

    yield crawlResult;

    // Extract & queue internal links
    $('a[href]').each((_, el) => {
      try {
        const href = $(el).attr('href');
        if (!href) return;

        const absoluteUrl = new URL(href, normalizedUrl).href;
        const normalized = normalizeUrl(absoluteUrl);

        // Filter: same domain, not visited, not blocked
        if (new URL(normalized).hostname !== baseUrl.hostname) return;
        if (visited.has(normalized)) return;
        if (blockedExtensions.test(normalized)) return;

        inlinksMap.set(normalized, (inlinksMap.get(normalized) || 0) + 1);
        queue.push({ url: normalized, depth: item.depth + 1, discoveredFrom: normalizedUrl });
      } catch { /* invalid URL, skip */ }
    });
  }
}
```

### URL Normalization

```typescript
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove fragment, trailing slash consistency, lowercase
    parsed.hash = '';
    let normalized = parsed.toString();
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return normalized.toLowerCase();
  } catch {
    return url;
  }
}
```

### In-Memory State

```typescript
// /store/crawl-store.ts
interface CrawlState {
  status: 'idle' | 'running' | 'done' | 'error';
  urls: CrawlResult[];
  totalFound: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

// Simple in-memory store (no persistence)
const store = new Map<string, CrawlState>();

export function getCrawlState(id: string): CrawlState | undefined {
  return store.get(id);
}

export function updateCrawlState(id: string, update: Partial<CrawlState>): void {
  const current = store.get(id) || { status: 'idle', urls: [], totalFound: 0, startedAt: null, completedAt: null };
  store.set(id, { ...current, ...update });
}
```

---

## 7. Docker Setup — Next.js + Playwright

### Dockerfile (Multi-stage Build)

```dockerfile
# ============================================
# Stage 1: Dependencies
# ============================================
ARG NODE_VERSION=20-bookworm
FROM node:${NODE_VERSION} AS dependencies

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --no-audit --no-fund

# ============================================
# Stage 2: Install Playwright Chromium
# ============================================
FROM dependencies AS playwright-setup

# Install only Chromium browser + system deps
RUN npx playwright install --with-deps chromium

# ============================================
# Stage 3: Build Next.js
# ============================================
FROM dependencies AS builder

COPY --from=playwright-setup /root/.cache/ms-playwright /root/.cache/ms-playwright

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ============================================
# Stage 4: Production Runner
# ============================================
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Install Playwright system dependencies (libs only, not browsers themselves)
RUN npx playwright install-deps chromium

# Copy standalone Next.js output
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Copy Playwright browsers from playwright-setup stage
COPY --from=playwright-setup /root/.cache/ms-playwright /home/node/.cache/ms-playwright

RUN mkdir .next && chown node:node .next

USER node

EXPOSE 3000

CMD ["node", "server.js"]
```

### next.config.js (Standalone Output)

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

module.exports = nextConfig;
```

### Image Size Optimization

| Optimization | Savings |
|-------------|---------|
| Chromium-only (not all 3 browsers) | ~600MB saved |
| `node:20-bookworm-slim` base (if Chromium deps installed separately) | ~100MB |
| `.dockerignore` (node_modules, .git, .next) | Faster builds |
| Standalone output mode | ~200MB smaller |
| Multi-stage build | Only runtime deps in final image |
| `--only-shell` flag for headless-only | ~50MB |

**Expected final image size: ~800MB-1.2GB** (Chromium alone is ~350-400MB, unavoidable).

### .dockerignore

```
node_modules
.next
.git
.gitignore
README.md
.env*
Dockerfile
docker-compose*.yml
plans/
docs/
```

---

## 8. Docker Compose

```yaml
version: '3.8'

services:
  screaming-web:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: screaming-web
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    # Required for Chromium in Docker
    ipc: host
    # Prevent zombie processes
    init: true
    # Security: limit memory
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 512M
    # Optional: seccomp profile for production scraping
    # security_opt:
    #   - seccomp=seccomp_profile.json
```

### Docker Run Command (Alternative)

```bash
docker run -d \
  --name screaming-web \
  -p 3000:3000 \
  --init \
  --ipc=host \
  --memory=2g \
  --restart unless-stopped \
  screaming-web
```

---

## 9. Dokploy Deployment

### Key Points

- Dokploy is a self-hosted PaaS (open-source alternative to Vercel/Heroku)
- Installs on VPS via: `curl -sSL https://dokploy.com/install.sh | sh`
- Uses Traefik for reverse proxy/load balancing
- Supports Docker Compose applications natively
- Auto-generates SSL certificates via Let's Encrypt
- Documentation at `docs.dokploy.com`

### Deployment Steps

1. Install Dokploy on VPS
2. Connect Git repository or use Docker Compose deployment
3. Configure domain + SSL
4. Set environment variables in Dokploy dashboard
5. Deploy

### Dokploy Configuration

- **Application Type**: Docker / Docker Compose
- **Port**: 3000
- **Memory**: Minimum 2GB recommended (Chromium is memory-hungry)
- **Health Check**: `GET /` on port 3000
- **Auto-deploy**: On git push to main branch

### VPS Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 2GB | 4GB |
| CPU | 1 core | 2 cores |
| Disk | 20GB | 40GB |
| OS | Ubuntu 22.04/24.04 | Ubuntu 24.04 |

---

## 10. Performance & Memory Considerations

### Playwright in Production

| Concern | Solution |
|---------|----------|
| Memory per page | ~50-100MB per Chromium tab. Limit concurrent tabs. |
| Browser crashes | Wrap in try/catch, restart browser on crash |
| Zombie processes | Use `--init` Docker flag |
| Chromium OOM | Use `--ipc=host` Docker flag |
| Slow pages | Set `timeout: 30000` on `page.goto()` |
| Resource waste | Block images/CSS/fonts via `page.route()` |

### Crawl Concurrency

- **Sequential** (simplest): Process one URL at a time. Good for small sites.
- **Parallel with limit**: Use semaphore pattern for N concurrent fetches.

```typescript
// Simple concurrency limiter
async function asyncPool<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const p = task().then(r => { results.push(r); });
    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex(e => e === p),
        1
      );
    }
  }

  await Promise.all(executing);
  return results;
}
```

### Memory Management

- **URL Set**: Use `Set<string>` for visited URLs (O(1) lookup)
- **Results Array**: In-memory, cleared on new scan
- **Playwright**: Single browser instance, new context per page
- **Max Pages**: Cap at configurable limit (default: 500)
- **Max Depth**: Cap at configurable limit (default: 3)

---

## 11. Export — CSV & JSON

### CSV Export

```typescript
import { objectsToCSV } from 'csv-utils'; // or manual

function toCSV(results: CrawlResult[]): string {
  const headers = ['url', 'status', 'contentType', 'depth', 'title', 'canonical', 'metaRobots', 'esIndexable', 'inlinks', 'discoveredFrom'];
  const rows = results.map(r =>
    headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}
```

### Route Handler for Export

```typescript
// /app/api/export/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'json';
  const scanId = searchParams.get('scanId');

  const state = getCrawlState(scanId);
  if (!state) return new Response('Not found', { status: 404 });

  if (format === 'csv') {
    const csv = toCSV(state.urls);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="crawl-results.csv"',
      },
    });
  }

  return new Response(JSON.stringify(state.urls, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="crawl-results.json"',
    },
  });
}
```

---

## 12. robots.txt Handling

```typescript
import robotsParser from 'robots-parser';

async function checkRobotsTxt(baseUrl: string): Promise<{
  isAllowed: (url: string) => boolean;
  getCrawlDelay: () => number;
}> {
  const robotsUrl = new URL('/robots.txt', baseUrl).href;

  try {
    const response = await fetch(robotsUrl);
    const text = await response.text();
    const parser = robotsParser(robotsUrl, text);

    return {
      isAllowed: (url: string) => parser.isAllowed(url, 'ScreamingWeb') ?? true,
      getCrawlDelay: () => parser.getCrawlDelay('ScreamingWeb') ?? 0,
    };
  } catch {
    // No robots.txt or error — allow all
    return { isAllowed: () => true, getCrawlDelay: () => 0 };
  }
}
```

---

## 13. Input Validation (Zod)

```typescript
import { z } from 'zod';

export const crawlRequestSchema = z.object({
  url: z.string().url('Invalid URL'),
  maxDepth: z.number().min(1).max(10).default(3),
  maxPages: z.number().min(1).max(5000).default(500),
  useJs: z.boolean().default(false),
});

export type CrawlRequest = z.infer<typeof crawlRequestSchema>;
```

---

## Implementation Recommendations

### Quick Start Guide

1. `npx create-next-app@latest screaming-web --typescript --tailwind --app --src-dir=false`
2. `npx shadcn@latest init`
3. `npx shadcn@latest add table button input card`
4. `npm install playwright cheerio zod robots-parser`
5. Create directory structure: `/crawler`, `/lib`, `/store`, `/utils`
6. Implement BFS crawler in `/crawler/`
7. Create Route Handler `/app/api/crawl/route.ts` with streaming
8. Build DataTable UI component
9. Add export endpoints
10. Create Dockerfile + docker-compose.yml

### Project Structure

```
/app
  /api
    /crawl/route.ts        # POST: Start crawl (SSE stream)
    /export/route.ts       # GET: Download results (CSV/JSON)
  /page.tsx                # Main page with URL input + results table
/components
  /ui/                     # shadcn/ui components (auto-generated)
  /crawl-form.tsx          # URL input + options form
  /crawl-results-table.tsx # DataTable with TanStack Table
  /crawl-progress.tsx      # Progress bar during scan
/crawler
  /bfs.ts                  # BFS crawler core (generator)
  /fetcher.ts              # Hybrid fetch (fetch + Playwright fallback)
  /parser.ts               # Cheerio HTML parsing
  /url-utils.ts            # URL normalization, filtering
  /robots.ts               # robots.txt handling
/lib
  /columns.ts              # TanStack Table column definitions
  /schemas.ts              # Zod validation schemas
  /types.ts                # TypeScript type definitions
/store
  /crawl-store.ts          # In-memory state management
/utils
  /export.ts               # CSV/JSON export helpers
```

### Common Pitfalls

1. **Not setting `output: 'standalone'`** — Docker image will be massive
2. **Installing all 3 Playwright browsers** — Only need Chromium. Use `npx playwright install chromium`
3. **Not using `--ipc=host`** — Chromium will crash with OOM in Docker
4. **Not blocking resource types in Playwright** — Wastes bandwidth/time loading images, CSS, fonts
5. **Not handling relative URLs** — Use `new URL(href, baseUrl)` to resolve
6. **Forgetting to close Playwright contexts** — Memory leak. Always use try/finally
7. **Not normalizing URLs** — `example.com/page` and `example.com/page/` are duplicates
8. **Crawl loops** — Always check visited set before queueing

---

## Resources & References

### Official Documentation
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Next.js Docker Deployment](https://nextjs.org/docs/app/building-your-application/deploying#docker-image)
- [Next.js Official Dockerfile](https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile)
- [Playwright Docker Docs](https://playwright.dev/docs/docker)
- [Playwright Library Usage](https://playwright.dev/docs/library)
- [Playwright Browser Installation](https://playwright.dev/docs/browsers)
- [Cheerio Documentation](https://cheerio.js.org/docs/)
- [TanStack Table Docs](https://tanstack.com/table/latest)
- [shadcn/ui Table Component](https://ui.shadcn.com/docs/components/table)

### NPM Packages
- `playwright` — Browser automation library
- `cheerio` — HTML parsing
- `zod` — Input validation
- `robots-parser` — robots.txt parsing
- `@tanstack/react-table` — Headless table logic (installed via shadcn)

### Deployment
- [Dokploy GitHub](https://github.com/Dokploy/dokploy) — Self-hosted PaaS
- [Dokploy Install](https://dokploy.com) — `curl -sSL https://dokploy.com/install.sh | sh`

---

## Unresolved Questions

1. **Rate limiting**: Should the crawler implement per-domain request throttling beyond robots.txt `Crawl-Delay`? Recommendation: start with a simple delay (e.g., 200ms between requests) and respect robots.txt.
2. **Concurrent crawling**: The initial implementation should be sequential for simplicity. Add optional concurrency (2-3 parallel) as a future enhancement.
3. **Memory ceiling**: For very large sites (5000+ pages), in-memory storage may become an issue. Monitor and cap at `maxPages`.
4. **Playwright browser pool**: Current design uses a single browser instance. For concurrent crawling, a browser pool with configurable max instances would be needed.
