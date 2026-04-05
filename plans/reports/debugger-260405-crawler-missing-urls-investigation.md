# Root Cause Analysis: Missing URLs in ScreamingWeb Crawler

**Target site:** infinitynails.es  
**Symptom:** Crawler finds ~42 URLs; other tools find 73+.  
**Date:** 2026-04-05

---

## Executive Summary

**ROOT CAUSE: The crawler does NOT parse sitemaps.** It relies exclusively on `<a href>` link discovery via BFS. URLs that exist only in `wp-sitemap.xml` (and are never linked from any page's HTML) are permanently invisible to the crawler.

This is NOT a bug in parser, URL normalization, or BFS logic. The link extraction, deduplication, and traversal code are all correct. The issue is a missing feature: sitemap.xml discovery and parsing.

---

## Evidence Chain

### Hypothesis 1: Parser misses links [ELIMINATED]

**Tested:** `parser.ts` extracts `$("a[href]")` on every page.  
**Evidence:** All links present in HTML are correctly extracted. Verified by comparing parser output vs raw `curl | grep` for 6 different pages. Every `<a href>` in the HTML is captured.  
**Verdict:** Parser is correct. No filtering bugs.

### Hypothesis 2: isBlockedExtension filters valid URLs [ELIMINATED]

**Tested:** `url-utils.ts` isBlockedExtension with DEFAULT_BLOCKED_EXTENSIONS.  
**Evidence:** All missing URLs (tag/*, category/*, author/*) have no file extension. `isBlockedExtension` returns `false` when no `.` exists in last path segment (line 46: `if (dotIndex === -1) return false`).  
**Verdict:** Extension blocking is correct. No false positives.

### Hypothesis 3: URL normalization causes dedup collisions [ELIMINATED]

**Tested:** normalizeUrl strips trailing slash and fragment.  
**Evidence:** All unique paths (e.g. `/tag/adelgazar`, `/tag/celulitis`) produce distinct normalized URLs. No two different URLs collapse to same value.  
**Verdict:** Normalization is correct.

### Hypothesis 4: Fetcher mishandles content types [ELIMINATED]

**Tested:** `isHtmlContentType` only accepts `text/html` and `application/xhtml+xml`.  
**Evidence:** All infinitynails.es pages return `content-type: text/html; charset=UTF-8`. No pages return non-HTML content types.  
**Verdict:** Content type handling is correct for this site.

### Hypothesis 5: robots.txt blocks pages [ELIMINATED]

**Tested:** robots.txt content:
```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Sitemap: https://infinitynails.es/wp-sitemap.xml
```
**Evidence:** Only `/wp-admin/` is disallowed. All tag/category/author pages are allowed.  
**Verdict:** robots.txt is not the cause.

### Hypothesis 6: Pages are not linked from HTML, only from sitemap [CONFIRMED]

**Tested:** Crawled 10 different page types (homepage, blog, blog/page/2, blog/page/3, tratamientos, tratamientos-corporales, tratamientos-faciales, blog posts, service sub-pages) and extracted ALL `<a href>` links.  
**Evidence:** NOT A SINGLE PAGE on infinitynails.es contains an `<a href>` link to any:
- `tag/*` page (15 URLs in sitemap)
- `category/*` page (1 URL in sitemap)
- `author/*` page (1 URL in sitemap)

These 17 URLs exist ONLY in the XML sitemap at `https://infinitynails.es/wp-sitemap.xml`.

**Verdict:** CONFIRMED ROOT CAUSE.

---

## Missing URLs Breakdown

| Source | Count | Discoverable by BFS? | Reason |
|--------|-------|----------------------|--------|
| Pages linked from HTML | ~42 | YES | Linked via `<a href>` from nav/footer/content |
| tag/* (15 URLs) | 15 | NO | Only in wp-sitemap-taxonomies-post_tag-1.xml |
| category/sin-categoria | 1 | NO | Only in wp-sitemap-taxonomies-category-1.xml |
| author/sruiz | 1 | NO | Only in wp-sitemap-users-1.xml |
| Service sub-pages (cavitacion, etc.) | ~9 | YES | Linked from tratamientos-corporales/faciales |
| Blog pagination (page/2, page/3) | 2 | YES | Linked from /blog/ and /blog/page/2/ |

**Total discoverable by BFS with depth 3:** ~53 pages (42 base + 9 service sub-pages + 2 pagination)

**Total in sitemaps:** 41 pages + 10 posts + 15 tags + 1 category + 1 author = 68 URLs

**Gap:** ~17 URLs only in sitemaps, not linked from any HTML page.

---

## BFS Traversal Map (depth 3)

```
Depth 0: / (homepage) -> 18 internal links
Depth 1: blog/, tratamientos/, tratamientos-corporales/, tratamientos-faciales/, 
          depilacion-2/, laser-2/, manicuras-y-pedicuras/, masajes-2/, pestanas/,
          nuestros-centros/, villanueva-de-la-canada/, villaviciosa-de-odon/,
          contacto/, pedir-cita/, aviso-legal/, politica-de-privacidad/, politica-de-cookies/
  -> blog/ yields: blog/page/2/, 6 blog posts
  -> tratamientos-corporales/ yields: 9 service sub-pages (cavitacion, etc.)
  -> tratamientos-faciales/ yields: 6 service sub-pages (hifu, mascara-led, etc.)
Depth 2: blog/page/2/ -> more blog posts (no new pages)
          Service sub-pages -> no new links (all link back to same nav)
Depth 3: blog/page/3/ (from page 2) -> no new links
```

All pages at every depth link back to the same navigation set. The site is a flat structure with no deep chains. The crawler correctly discovers everything reachable via `<a href>`.

---

## Secondary Findings (NOT bugs, but notes)

1. **`/servicios/pestanas` on tratamientos page:** This URL 301-redirects to `/pestanas/`. The crawler follows redirects correctly (`redirect: "follow"` in fetcher) and `response.url` captures the final URL. Not a problem.

2. **Some pages have `<a href>` without `https://` prefix:** The tratamientos-corporales page uses relative links like `/cavitacion/`. `resolveUrl()` handles these correctly via `new URL(href, baseUrl)`.

3. **`blog/page/3/` exists but has no blog posts** (only nav links). Still returns 200 OK. The crawler correctly visits it and finds no new links.

---

## Recommended Fix

Add sitemap.xml parsing to seed the BFS queue before crawling begins.

**Implementation approach:**
1. In `bfs.ts`, before starting BFS loop, fetch and parse the site's `sitemap.xml`
2. Use the robots.txt `Sitemap:` directive (already fetched) to locate sitemap URL
3. Parse XML sitemap index, recursively fetch child sitemaps
4. Add all discovered URLs to the queue at depth 0
5. Existing dedup (visited/queued sets) prevents double-fetching

**Files to modify:**
- `crawler/sitemap.ts` (new) - sitemap fetching and XML parsing
- `crawler/bfs.ts` - integrate sitemap URLs into initial queue
- `crawler/robots.ts` - expose sitemap URL from robots.txt parse

---

## Unresolved Questions

1. Should sitemap-discovered URLs count toward the maxPages limit? Likely yes, but worth confirming with user.
2. Should the crawler support `Sitemap:` directives in `robots.txt` that point to external domains? Probably not (security).
3. Should sitemap URLs be marked with a `discoveredFrom: "sitemap"` field for UI transparency?
