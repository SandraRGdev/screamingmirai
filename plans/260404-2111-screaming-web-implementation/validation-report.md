# Plan Validation Report — ScreamingWeb Implementation

**Date:** 2026-04-04
**Plan:** `plans/260404-2111-screaming-web-implementation/`
**Mode:** `--validate` (critical questions interview)

---

## Overall Assessment

The plan is **comprehensive and well-structured** with 9 phases covering all functional requirements. However, there are **7 critical issues** and **5 warnings** that should be addressed before implementation begins.

---

## Critical Issues (MUST FIX)

### C1. `useEffect` Violations in Phase 6

**Files:** `phase-06-ui-results-table.md:243-281`

The `useCrawlResults` hook uses `useEffect` for data fetching — directly violating the **no-use-effect skill** that is now a mandatory development norm.

```ts
// Phase 6 code — VIOLATES no-use-effect skill
useEffect(() => {
  if (!crawlId) return;
  const fetchResults = async () => { ... };
  fetchResults();
}, [crawlId, page]);
```

**Fix:** Use a data-fetching library (React Query / SWR) or a Server Component pattern. If this is a Client Component, use React Query's `useQuery` with pagination.

### C2. No Data-Fetching Library in Dependencies

**Files:** `phase-01-project-scaffolding.md`, `phase-05-ui-crawl-form.md`, `phase-06-ui-results-table.md`

The plan uses native `fetch` in `useEffect` for data fetching (crawl results hook) but never includes a data-fetching library (React Query, SWR) in the dependency list. Phase 1 installs `cheerio zod robots-parser` but no data-fetching lib.

**Fix:** Add `@tanstack/react-query` to Phase 1 dependencies, create a `QueryClient` provider in layout.

### C3. Type Duplication Between `lib/types.ts` and `crawler/types.ts`

**Files:** `phase-01-project-scaffolding.md:136-149`, `phase-02-bfs-crawler-core.md:92-127`, `phase-04-api-streaming.md:389-401`

`CrawlResult` is defined identically in 3 places:
- Phase 1: `lib/types.ts` — `CrawlResult` interface
- Phase 2: `crawler/types.ts` — `ParsedResult` (similar but different name)
- Phase 4: `lib/types.ts` — `CrawlResult` again (redefinition)

This violates DRY and will cause import confusion.

**Fix:** Single source of truth — `lib/types.ts` exports `CrawlResult`. `crawler/types.ts` exports only crawler-internal types (`QueueItem`, `CrawlerConfig`, `FetchResult`). `ParsedResult` should be unified with `CrawlResult` or explicitly documented as a different shape.

### C4. `normalizeUrl` Doesn't Lowercase Hostname

**Files:** `phase-02-bfs-crawler-core.md:133-144`

The plan's `normalizeUrl` does NOT lowercase the hostname, but the research report explicitly says it should. Phase 9 tests expect lowercasing:

```ts
// Plan code — missing hostname lowercasing
export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  const normalized = parsed.href;
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}
```

**Note:** `new URL()` already lowercases the hostname in Node.js (WHATWG spec). So the function works correctly but the omission should be documented as relying on the URL constructor behavior.

### C5. SSE Stream Doesn't Send `pagesDiscovered` Updates

**Files:** `phase-04-api-streaming.md:210-248`

The progress bar in Phase 5 (`CrawlProgress`) shows `crawled / total` but the SSE stream only sends `total` in the `done` event. During crawling, `total` stays at 0 — making the progress bar useless until completion.

**Fix:** The SSE `page` events should include `pagesDiscovered` (queue length + visited size + 1) so the progress bar shows meaningful progress during the crawl:

```ts
controller.enqueue(encoder.encode(
  `data: ${JSON.stringify({
    type: 'page',
    data: result,
    stats: { crawled: session.stats.pagesCrawled, discovered: queue.length + visited.size }
  })}\n\n`
));
```

### C6. `crawlGenerator` and Session Store Are Disconnected

**Files:** `phase-04-api-streaming.md:192-291`

The API route creates a `crawlGenerator` with `createConfig()` but also mutates `session.results` and `session.stats` directly. The generator doesn't accept an `AbortSignal` for cancellation — it checks `session.abortController.signal.aborted` via closure, which is fragile.

**Fix:** Pass `AbortSignal` to the crawler config. The generator should check `signal.aborted` itself, not rely on external session mutation.

### C7. Docker `curl` Not Available in `bookworm-slim`

**Files:** `phase-08-docker-dokploy.md:196-200`

The health check uses `curl`:
```yaml
test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
```

But `node:20-bookworm-slim` does NOT include `curl`. The health check will fail.

**Fix:** Use `wget` (available in slim) or `node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1))"` or install `curl` in the Dockerfile.

---

## Warnings (SHOULD FIX)

### W1. No `@/hooks/` Path Alias Configured

Phase 5 creates `hooks/use-crawl-stream.ts` and imports it as `@/hooks/use-crawl-stream`. Phase 1 only configures `@/*` → `./*` in tsconfig paths, but hooks/ directory doesn't exist yet and the alias maps to the root. This should work but verify during Phase 5.

### W2. `app/page.tsx` is a Client Component

Phase 5 makes the entire main page `'use client'`. This defeats Next.js App Router's server component benefits (streaming, partial prerendering). Consider keeping the page as a Server Component and wrapping only interactive parts in Client Components.

### W3. No Error Boundary for Crawl Failures

If the SSE stream crashes or the crawler throws an unhandled error, there's no React Error Boundary to catch it. The UI will show a blank page.

### W4. Phase Ordering Creates Unnecessary Wait

Phase 4 (API) is blocked by Phase 3 (Hybrid Fetch), but the basic BFS crawler (Phase 2) can be exposed via API without Playwright. Consider:
- Phase 4 API with Cheerio-only fetch
- Phase 3 Playwright added later
- This allows testing the full stack earlier

### W5. `discoveredFrom` is Always `null` in CrawlResult

The `CrawlResult.discoveredFrom` field is set to `null` in the API route (Phase 4:232). The BFS crawler tracks `discoveredFrom` in queue items but the API route doesn't pass it through. This field is useless as implemented.

---

## Consistency Checks

| Check | Status | Notes |
|-------|--------|-------|
| Dependency chain valid | PASS | Phase 1→2→3→4→5→6→7→8→9 |
| No circular dependencies | PASS | Linear chain |
| All branches named | PASS | All phases have feature branches |
| Semver consistent | PASS | v0.1.0 through v0.9.0, release v1.0.0 |
| File size <200 lines | FAIL | Phase 5 `use-crawl-stream.ts` ~229 lines |
| Types consistent across phases | FAIL | C3 above |
| no-use-effect compliance | FAIL | C1 above |
| Docker config valid | FAIL | C7 above |

---

## Critical Questions for User

### Q1: Data-Fetching Library Choice

Given the no-use-effect skill mandates data-fetching libraries (Rule 2), which should we use?

**Options:**
- **TanStack React Query** — Industry standard, great caching, pagination support
- **SWR** — Lighter, Vercel-maintained, simpler API
- **Server Components only** — No client-side fetching at all (fetch in Server Components + Server Actions)

### Q2: Crawl Results Architecture

Should results be:
- **A)** Stored server-side in session, fetched via paginated API (current plan)
- **B)** Streamed entirely to client via SSE, stored in client state (simpler, no results API needed)
- **C)** Hybrid — stream to client for real-time display, also store server-side for export API

### Q3: Phase Ordering — Early API Test

Should we reorder to get API working with basic Cheerio first (without waiting for Playwright)?
- This allows testing the full stack (form → crawl → results) by end of Phase 4 instead of Phase 7

### Q4: Main Page Server vs Client Component

Should the main page remain a Server Component with Client Component islands?
- Yes — better TTFB, streaming, partial prerendering
- No — simpler to make it all client-side

### Q5: Concurrency Model

The plan uses sequential crawling (one URL at a time). Should Phase 2 include optional concurrency (2-3 parallel)?
- This significantly impacts crawl speed but adds complexity

---

## Summary

| Category | Count |
|----------|-------|
| Critical Issues | 7 |
| Warnings | 5 |
| Consistency Failures | 3 |
| Questions for User | 5 |

**Recommendation:** Fix C1-C3 (no-use-effect violations, missing dependency, type duplication) before starting implementation. C5-C7 can be fixed during implementation. Address questions Q1-Q5 before Phase 5 (UI) begins.
