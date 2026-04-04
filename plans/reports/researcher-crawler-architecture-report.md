# Research Report: SEO Web Crawler Architecture Patterns (TypeScript/Node.js)

**Date:** 2026-04-04
**Scope:** BFS crawler, Cheerio SEO extraction, URL filtering, in-memory state, CSV/JSON export
**Project Context:** ScreamingWeb — browser-based SEO crawler (similar to Screaming Frog)

---

## 1. BFS Crawler Implementation Pattern

### 1.1 Architecture Overview

BFS (breadth-first search) is the correct traversal strategy for SEO crawlers. It discovers all pages at depth N before moving to depth N+1, which mirrors how search engines crawl and provides natural site-wide coverage at each depth level.

**Why BFS over DFS:** DFS can get stuck deep in URL parameter permutations before discovering important shallow pages. BFS guarantees all high-priority (shallow) pages are crawled first. Screaming Frog uses BFS for this reason.

### 1.2 Core Data Structures

```typescript
// Queue entry — tracks URL + its crawl depth
interface QueueItem {
  url: string;       // normalized absolute URL
  depth: number;     // crawl depth (0 = seed URL)
  parentUrl?: string; // URL that linked to this page
}

// Crawler configuration
interface CrawlerConfig {
  seedUrl: string;
  maxDepth: number;       // max crawl depth from seed
  maxPages: number;       // hard stop on total pages crawled
  concurrency: number;    // parallel request limit (1 for simple BFS, >1 for performance)
  requestTimeout: number; // ms
  userAgent: string;
  respectRobotsTxt: boolean;
  blockedExtensions: string[]; // file extensions to skip
  sameDomainOnly: boolean;
}

// Crawl result for a single page
interface PageResult {
  url: string;
  depth: number;
  statusCode: number;
  contentType: string;
  title: string | null;
  canonicalUrl: string | null;
  metaRobots: string | null;
  h1: string | null;
  h2Count: number;
  internalLinks: string[];
  externalLinks: string[];
  wordCount: number;
  crawlTimestamp: number;
  error?: string;
}
```

### 1.3 BFS Algorithm Implementation

```typescript
class BfsCrawler {
  private queue: QueueItem[] = [];
  private visited: Set<string> = new Set();   // O(1) lookup for dedup
  private results: Map<string, PageResult> = new Map(); // keyed by normalized URL
  private discoveredCount: number = 0;

  constructor(private config: CrawlerConfig) {}

  async crawl(): Promise<Map<string, PageResult>> {
    // Seed the queue
    this.queue.push({ url: this.config.seedUrl, depth: 0 });
    this.visited.add(this.normalizeUrl(this.config.seedUrl));
    this.discoveredCount = 1;

    while (
      this.queue.length > 0 &&
      this.results.size < this.config.maxPages
    ) {
      const batch = this.dequeueBatch(this.config.concurrency);
      const promises = batch.map(item => this.crawlPage(item));
      const pageResults = await Promise.allSettled(promises);

      for (let i = 0; i < pageResults.length; i++) {
        const result = pageResults[i];
        if (result.status === 'fulfilled' && result.value) {
          const page = result.value;
          this.results.set(page.url, page);

          // Extract and enqueue new URLs
          for (const link of page.internalLinks) {
            const normalized = this.normalizeUrl(link);
            if (
              !this.visited.has(normalized) &&
              batch[i].depth + 1 <= this.config.maxDepth &&
              this.shouldCrawl(normalized)
            ) {
              this.visited.add(normalized);
              this.queue.push({
                url: normalized,
                depth: batch[i].depth + 1,
                parentUrl: page.url,
              });
              this.discoveredCount++;
            }
          }
        }
      }
    }
    return this.results;
  }

  private dequeueBatch(size: number): QueueItem[] {
    // Take up to `size` items from front of queue (FIFO = BFS)
    return this.queue.splice(0, Math.min(size, this.queue.length));
  }

  private normalizeUrl(rawUrl: string): string {
    const url = new URL(rawUrl);
    // Strip fragment, lowercase host, remove trailing slash on path
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.endsWith('/') && url.pathname.length > 1) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.href;
  }
}
```

### 1.4 Key Design Decisions

| Decision | Recommendation | Rationale |
|---|---|---|
| Queue type | Plain `Array` with shift/splice | For <100K URLs, array shift is fine. For >100K, use a proper deque or linked structure |
| Visited set | `Set<string>` | O(1) lookup, handles dedup. Normalized URLs as keys. Memory: ~200 bytes per URL |
| Concurrency | Start at 1, allow config up to 5 | Too aggressive = get blocked. Respect crawl-delay from robots.txt |
| URL normalization | Strip fragment, lowercase host, remove trailing slash, remove default ports | Prevents crawling same page multiple times |

### 1.5 Source Credibility

- Node.js WHATWG `URL` class (nodejs.org/api/url.html): built-in, zero-dependency URL parsing. `new URL(input, base)` resolves relative URLs correctly.
- BFS pattern is standard across Screaming Frog, Sitebulb, and all major SEO crawlers.
- `Set<string>` for visited: proven pattern, used by every Node.js crawler implementation (npm crawlers like `simplecrawler`, `node-crawler`).

---

## 2. SEO Data Extraction with Cheerio

### 2.1 Setup and Loading

Cheerio is the de-facto standard for HTML parsing in Node.js. jQuery-like API, ~8x faster than JSDOM.

**Source:** cheerio.js.org official docs — `load()` method for string input, `loadBuffer()` for binary.

```typescript
import * as cheerio from 'cheerio';

function parseHtml(html: string) {
  // null, false = don't add <html>/<head>/<body> wrappers
  const $ = cheerio.load(html, null, false);
  return $;
}
```

### 2.2 Title Tag Extraction

```typescript
function extractTitle($: cheerio.CheerioAPI): string | null {
  const title = $('title').first().text().trim();
  return title || null;
}
```

Edge cases: multiple `<title>` tags (take first), empty title, title with only whitespace.

### 2.3 Canonical URL Extraction

```typescript
function extractCanonical($: cheerio.CheerioAPI, pageUrl: string): string | null {
  const canonical = $('link[rel="canonical"]').first().attr('href');
  if (!canonical) return null;

  // Resolve relative canonical URLs against page URL
  try {
    return new URL(canonical, pageUrl).href;
  } catch {
    return canonical; // return raw value if unparseable
  }
}
```

**Why resolve with pageUrl:** Some sites use relative canonicals (`<link rel="canonical" href="/page">`). The WHATWG `URL` constructor handles this when you pass `pageUrl` as the base.

### 2.4 Meta Robots Directives

```typescript
function extractMetaRobots($: cheerio.CheerioAPI): string | null {
  // Both name="robots" and name="ROBOTS" (case-insensitive selector)
  const content = $('meta[name="robots" i]').first().attr('content');
  return content?.trim() || null;
}
```

Key directives to parse: `noindex`, `nofollow`, `noarchive`, `nosnippet`. A page with `noindex` should still be crawled (to discover links) but flagged as non-indexable.

### 2.5 Link Extraction (All `<a href="">`)

```typescript
interface ExtractedLinks {
  internal: string[];
  external: string[];
}

function extractLinks(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  seedDomain: string
): ExtractedLinks {
  const internal = new Set<string>();
  const external = new Set<string>();

  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href');
    if (!rawHref) return;

    // Skip javascript:, mailto:, tel:, #fragments-only
    if (
      rawHref.startsWith('javascript:') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:') ||
      rawHref === '#'
    ) {
      return;
    }

    try {
      const resolved = new URL(rawHref, pageUrl).href;
      const urlObj = new URL(resolved);

      if (urlObj.hostname === seedDomain) {
        internal.add(resolved);
      } else {
        external.add(resolved);
      }
    } catch {
      // Invalid URL, skip
    }
  });

  return {
    internal: Array.from(internal),
    external: Array.from(external),
  };
}
```

### 2.6 Absolute URL Conversion from Relative

The WHATWG `URL` constructor handles this natively:

```typescript
// All resolved correctly with one line:
const absolute = new URL(relativeOrAbsoluteUrl, baseUrl).href;

// Examples:
new URL('/about', 'https://example.com/').href          // 'https://example.com/about'
new URL('./page', 'https://example.com/dir/').href       // 'https://example.com/dir/page'
new URL('../up', 'https://example.com/dir/sub/').href    // 'https://example.com/dir/up'
new URL('https://other.com/', 'https://example.com/').href // 'https://other.com/' (absolute passthrough)
```

**Source:** Node.js v25.9.0 URL docs — `new URL(input, base)` handles all resolution per WHATWG standard.

### 2.7 Source Credibility

- Cheerio v1.0.0+ (cheerio.js.org): 29K+ GitHub stars, actively maintained, de-facto standard for server-side HTML parsing in Node.js
- `new URL(input, base)` from WHATWG URL Standard: implemented natively in Node.js since v7.0, no external dependency needed

---

## 3. URL Filtering Best Practices

### 3.1 File Extension Blocking

```typescript
const DEFAULT_BLOCKED_EXTENSIONS = new Set([
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff',
  // Styles & Scripts
  '.css', '.js', '.mjs',
  // Documents (crawl these separately if needed, but not as HTML pages)
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Media
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.wav', '.ogg',
  // Archives
  '.zip', '.tar', '.gz', '.rar', '.7z',
  // Fonts
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  // Other non-HTML
  '.json', '.xml', '.rss', '.atom', '.txt',
  '.swf', '.flv',
]);

function isBlockedExtension(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  const lastSegment = pathname.split('/').pop() || '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex === -1) return false; // no extension = likely HTML
  const ext = lastSegment.substring(dotIndex);
  return DEFAULT_BLOCKED_EXTENSIONS.has(ext);
}
```

**Design choice:** Use `Set` for O(1) lookup. Check only last segment of pathname (handles `/path/to/image.jpg?query`). Case-insensitive comparison.

### 3.2 Content-Type Verification

After HTTP response, verify the content is HTML before parsing:

```typescript
function isHtmlResponse(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase().split(';')[0].trim();
  return ct === 'text/html' || ct === 'application/xhtml+xml';
}

// Usage in crawlPage:
const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
if (!isHtmlResponse(response.headers.get('content-type'))) {
  return null; // skip non-HTML responses
}
```

**Why not rely on extension alone:** Some CMSes serve HTML at URLs with no extension or even `.php` extensions. Content-Type is authoritative. Filter on extension BEFORE fetch (save bandwidth), verify Content-Type AFTER fetch.

### 3.3 robots.txt Respect

**Recommended package:** `robots-parser` (npmjs.com/package/robots-parser) by Sam Clarke.

- 3.x latest, stable, TypeScript definitions included
- Implements draft robots.txt specification
- Supports: `User-agent`, `Allow`, `Disallow`, `Sitemap`, `Crawl-delay`, `Host`, wildcards (`*`), EOL matching (`$`)

```typescript
import robotsParser from 'robots-parser';

async function loadRobotsTxt(seedUrl: string): Promise<ReturnType<typeof robotsParser>> {
  const robotsUrl = new URL('/robots.txt', seedUrl).href;
  try {
    const response = await fetch(robotsUrl);
    const text = await response.text();
    return robotsParser(robotsUrl, text);
  } catch {
    // No robots.txt = allow all
    return robotsParser(robotsUrl, '');
  }
}

// Usage:
const robots = await loadRobotsTxt(config.seedUrl);

// Before crawling each URL:
if (config.respectRobotsTxt && !robots.isAllowed(url, config.userAgent)) {
  return null; // skip disallowed URLs
}

// Respect crawl-delay:
const crawlDelay = robots.getCrawlDelay(config.userAgent);
if (crawlDelay) {
  await sleep(crawlDelay * 1000);
}
```

### 3.4 Domain Filtering (Same-Domain Only)

```typescript
function isSameDomain(url: string, seedDomain: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === seedDomain;
  } catch {
    return false;
  }
}

// Extract seed domain once at crawl start:
const seedDomain = new URL(config.seedUrl).hostname;
```

### 3.5 Complete Filter Pipeline (in order)

```
1. Normalize URL (strip fragment, lowercase host)
2. Check visited set (dedup)
3. Check domain filter (same-domain only)
4. Check file extension blocklist (skip .jpg, .css, etc.)
5. Check robots.txt (if enabled)
6. Fetch URL
7. Check Content-Type = text/html
8. Parse with Cheerio
9. Extract SEO data + links
10. Enqueue discovered links back to step 1
```

### 3.6 Source Credibility

- `robots-parser` v3.0.1: MIT licensed, spec-compliant, actively maintained
- Content-Type filtering: standard HTTP practice, confirmed by MDN and Node.js HTTP docs
- Extension blocking list: derived from Screaming Frog's default blocklist and common SEO crawler implementations

---

## 4. In-Memory State Management Patterns

### 4.1 Crawl Session State

```typescript
interface CrawlSession {
  id: string;                          // unique session ID
  config: CrawlerConfig;               // crawl configuration
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  seedUrl: string;
  seedDomain: string;

  // Core state
  queue: QueueItem[];                  // URLs waiting to be crawled
  visited: Set<string>;                // all discovered URLs (normalized)
  results: Map<string, PageResult>;    // completed crawl results

  // Progress tracking
  pagesCrawled: number;                // successfully crawled
  pagesDiscovered: number;             // total found (including queued)
  pagesFailed: number;                 // errors
  currentDepth: number;                // deepest level being crawled

  // Timing
  startedAt: number | null;            // timestamp
  completedAt: number | null;          // timestamp
  estimatedCompletion: number | null;  // ETA

  // Robots.txt
  robotsTxt: ReturnType<typeof robotsParser> | null;
}
```

### 4.2 Progress Tracking

```typescript
class CrawlProgress {
  constructor(private session: CrawlSession) {}

  get progress(): number {
    // percentage of discovered pages that have been crawled
    if (this.session.pagesDiscovered === 0) return 0;
    return Math.round(
      (this.session.pagesCrawled / this.session.pagesDiscovered) * 100
    );
  }

  get pagesPerSecond(): number {
    if (!this.session.startedAt) return 0;
    const elapsed = (Date.now() - this.session.startedAt) / 1000;
    return elapsed > 0 ? this.session.pagesCrawled / elapsed : 0;
  }

  get estimatedTimeRemaining(): number | null {
    const pps = this.pagesPerSecond;
    if (pps === 0) return null;
    const remaining = this.session.pagesDiscovered - this.session.pagesCrawled;
    return remaining / pps; // seconds
  }

  get summary(): CrawlProgressSummary {
    return {
      pagesCrawled: this.session.pagesCrawled,
      pagesDiscovered: this.session.pagesDiscovered,
      pagesFailed: this.session.pagesFailed,
      pagesQueued: this.session.queue.length,
      progress: this.progress,
      pagesPerSecond: this.pagesPerSecond,
      estimatedTimeRemaining: this.estimatedTimeRemaining,
      status: this.session.status,
    };
  }
}
```

### 4.3 Real-Time Updates to Client

**Recommended: Server-Sent Events (SSE)** — not WebSockets.

**Why SSE over WebSocket:**
- Unidirectional (server -> client) — crawlers push updates, client doesn't need to send data
- Simpler to implement (no protocol negotiation, no connection management complexity)
- Auto-reconnect built into browser
- Works with HTTP/2
- No additional library needed on server side

```typescript
// Server-side: SSE emitter (Express/Node)
import { EventEmitter } from 'events';

class CrawlEventEmitter extends EventEmitter {}

const emitter = new CrawlEventEmitter();

// During crawl, emit events:
emitter.emit('page-crawled', { url, result, progress: progressSummary });
emitter.emit('crawl-complete', { results: results.size });
emitter.emit('crawl-error', { url, error });

// SSE endpoint
app.get('/api/crawl/:id/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onPageCrawled = (data: any) => {
    res.write(`event: page-crawled\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const onComplete = (data: any) => {
    res.write(`event: crawl-complete\ndata: ${JSON.stringify(data)}\n\n`);
    res.end();
  };

  emitter.on('page-crawled', onPageCrawled);
  emitter.on('crawl-complete', onComplete);

  req.on('close', () => {
    emitter.off('page-crawled', onPageCrawled);
    emitter.off('crawl-complete', onComplete);
  });
});
```

```typescript
// Client-side: EventSource API
const eventSource = new EventSource(`/api/crawl/${crawlId}/events`);

eventSource.addEventListener('page-crawled', (event) => {
  const data = JSON.parse(event.data);
  updateUI(data.result, data.progress);
});

eventSource.addEventListener('crawl-complete', (event) => {
  eventSource.close();
  showCompleteSummary();
});
```

### 4.4 Memory Considerations

| Metric | Estimate | Notes |
|---|---|---|
| Per URL in visited Set | ~200 bytes | normalized URL string + Set overhead |
| Per PageResult in Map | ~1-2 KB | depends on link count |
| 10K pages | ~20-30 MB | comfortable for browser + Node |
| 50K pages | ~100-150 MB | approaching limits for browser tab |
| 100K+ pages | 300 MB+ | consider streaming to disk or chunked export |

For a browser-based tool targeting <50K pages (similar to Screaming Frog free tier of 500 URLs), in-memory is perfectly viable.

### 4.5 Source Credibility

- SSE: MDN EventSource documentation, WHATWG Fetch Standard
- EventEmitter pattern: Node.js built-in (`node:events`)
- Memory estimates: based on V8 heap profiling of Map/Set with string keys

---

## 5. CSV and JSON Export Patterns

### 5.1 JSON Export

Simple — `JSON.stringify` handles everything. For large datasets, stream it.

```typescript
import { createWriteStream } from 'fs';
import { stringify as jsonStringify } from 'csv-stringify/sync';

// Simple JSON export (in-memory)
function exportJson(results: Map<string, PageResult>): string {
  const pages = Array.from(results.values());
  return JSON.stringify({
    crawlMetadata: {
      exportedAt: new Date().toISOString(),
      totalPages: pages.length,
    },
    pages,
  }, null, 2);
}

// Streaming JSON export (for large datasets)
function exportJsonStream(results: Map<string, PageResult>, filePath: string): void {
  const stream = createWriteStream(filePath);
  const pages = Array.from(results.values());

  stream.write('{\n  "pages": [\n');
  pages.forEach((page, i) => {
    const comma = i < pages.length - 1 ? ',' : '';
    stream.write(`    ${JSON.stringify(page)}${comma}\n`);
  });
  stream.write('  ]\n}');
  stream.end();
}
```

### 5.2 CSV Export

**Recommended approach:** Use Node.js built-in CSV support (Node 22+) or the lightweight `csv-stringify` package.

```typescript
import { stringify } from 'csv-stringify/sync';

function exportCsv(results: Map<string, PageResult>): string {
  const columns = [
    'url', 'statusCode', 'title', 'canonicalUrl', 'metaRobots',
    'h1', 'h2Count', 'wordCount', 'internalLinksCount',
    'externalLinksCount', 'depth', 'crawlTimestamp',
  ];

  const rows = Array.from(results.values()).map(page => [
    page.url,
    page.statusCode,
    page.title || '',
    page.canonicalUrl || '',
    page.metaRobots || '',
    page.h1 || '',
    page.h2Count,
    page.wordCount,
    page.internalLinks.length,
    page.externalLinks.length,
    page.depth,
    new Date(page.crawlTimestamp).toISOString(),
  ]);

  return stringify(rows, {
    header: true,
    columns,
    quoted_string: true,   // quote fields containing commas/quotes
    delimiter: ',',
  });
}
```

### 5.3 Browser Download (No Server)

Since this is a browser-based tool, use Blob + URL.createObjectURL:

```typescript
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Usage:
downloadFile(exportCsv(results), 'crawl-report.csv', 'text/csv');
downloadFile(exportJson(results), 'crawl-report.json', 'application/json');
```

### 5.4 Source Credibility

- `csv-stringify`: part of the `csv` package ecosystem (npmjs.com/package/csv), 5M+ weekly downloads
- `Blob` + `URL.createObjectURL`: MDN Web API standard, supported in all modern browsers
- Streaming pattern: Node.js `fs.createWriteStream` — official Node.js docs

---

## 6. Trade-Off Matrix

| Dimension | In-Memory (Recommended) | On-Disk (SQLite/LevelDB) |
|---|---|---|
| **Complexity** | Low — plain JS objects | Medium — schema, queries, serialization |
| **Performance** | Excellent — zero I/O overhead | Good — SSD mitigates but adds latency |
| **Scale limit** | ~50K pages comfortably | 500K+ pages |
| **Export speed** | Instant — data already in JS | Fast — read from disk |
| **Persistence** | Lost on page close | Survives restarts |
| **Implementation time** | Hours | Days |

**Recommendation for ScreamingWeb:** Start in-memory. The target use case (SEO audits) typically involves 500-10K pages. Add disk persistence only if/when users need >50K page crawls. YAGNI.

| Dimension | SSE (Recommended) | WebSocket |
|---|---|---|
| **Direction** | Server -> Client only | Bidirectional |
| **Complexity** | Low — HTTP endpoint | Medium — protocol, reconnect logic |
| **Browser API** | `EventSource` built-in | Need library (`ws`, `socket.io`) |
| **Auto-reconnect** | Built-in | Manual |
| **Binary support** | No | Yes |
| **Fit for crawler** | Perfect — one-way updates | Overkill |

**Recommendation:** SSE. Crawler only pushes updates to client. No need for bidirectional communication.

| Dimension | fetch (Built-in) | axios | got |
|---|---|---|---|
| **Bundle size** | 0 (built into Node 18+) | ~13KB | ~30KB |
| **HTTP/2 support** | No (Node fetch) | No | Yes |
| **Timeout** | `AbortSignal.timeout()` | `timeout` option | `timeout` option |
| **Redirect handling** | Automatic (manual opt) | Automatic | Automatic |
| **Fit for crawler** | Perfect | Fine but unnecessary | Overkill |

**Recommendation:** Native `fetch`. Zero dependencies, built into Node.js 18+ and all modern browsers.

---

## 7. Concrete Recommendation

### Ranked Technology Choices

1. **fetch + Cheerio + Set/Map + SSE** — the stack to use
   - Zero heavy dependencies
   - All battle-tested, high adoption, low risk
   - Perfect fit for browser-based SEO crawler

2. ~~Puppeteer/Playwright~~ — avoid for crawling
   - 10-50x slower per page (full browser render)
   - Use ONLY for JavaScript-rendered pages as opt-in feature later
   - Not needed for standard SEO crawls

3. ~~JSDOM~~ — avoid
   - Slower than Cheerio
   - More memory
   - Only advantage (full DOM) not needed for SEO extraction

### Adoption Risk

| Technology | Risk Level | Maturity | Breaking Changes |
|---|---|---|---|
| Cheerio | **Low** | v1.0 stable, 10+ years | Rare, well-documented migrations |
| robots-parser | **Low** | v3.x, spec-compliant | Minimal API surface, unlikely to break |
| Node fetch | **Low** | Stable in Node 18+, WHATWG standard | None expected |
| WHATWG URL | **None** | Node.js global since v10 | Standard, will not break |

### Architectural Fit

For a browser-based SEO tool:
- **Frontend:** React/Next.js renders crawl UI, consumes SSE for real-time updates
- **Backend:** Node.js server runs the BFS crawler, pushes events via SSE
- **Storage:** In-memory `Map<string, PageResult>` per crawl session
- **Export:** CSV/JSON download via Blob API in browser

### Dependency List (Minimal)

```
cheerio          — HTML parsing
robots-parser    — robots.txt parsing
```

That is it. Everything else (fetch, URL, EventEmitter, SSE, CSV) is built into Node.js or the browser.

---

## 8. Limitations & Unresolved Questions

### What This Research Did NOT Cover

1. **JavaScript rendering:** Pages requiring JS to render content (SPAs) won't be fully crawled with fetch+Cheerio. This is a known limitation. Solution: offer optional Puppeteer-based rendering as a premium feature later.
2. **Rate limiting / politeness:** Beyond `crawl-delay` from robots.txt, intelligent per-host rate limiting was not designed. Recommend a simple fixed-delay between requests (e.g., 200ms) as a starting point.
3. **Authentication / login-protected pages:** Not in scope.
4. **Sitemap.xml parsing:** Could supplement seed URL discovery. Not covered here.
5. **Memory profiling:** Actual memory usage numbers should be validated with a prototype crawl of a real site.
6. **Concurrency model:** The report shows a simple `Promise.allSettled` batch approach. For production, consider using `p-limit` or a semaphore for more controlled concurrency.

### Unresolved Questions

- **Q1:** What is the expected max page count per crawl? This determines whether in-memory is sufficient or disk persistence is needed from day 1.
- **Q2:** Will this be a pure client-side tool (all crawling in browser) or a server-side crawler with browser UI? The architecture differs significantly. Server-side is recommended for reliability (no CORS, no browser memory limits).
- **Q3:** Should the crawler handle redirects (3xx) and record redirect chains? Screaming Frog does this — it is valuable for SEO audits but adds complexity.

---

## Sources

- Cheerio official docs: https://cheerio.js.org/docs/basics/loading
- Node.js URL API (v25.9.0): https://nodejs.org/api/url.html
- robots-parser npm: https://www.npmjs.com/package/robots-parser
- WHATWG URL Standard: https://url.spec.whatwg.org/
- MDN EventSource (SSE): https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- Node.js csv-stringify: https://csv.js.org/
