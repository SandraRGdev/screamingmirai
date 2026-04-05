/**
 * Sitemap.xml parser. Fetches and extracts URLs from sitemap indexes
 * and URL sets. Handles recursive sitemap indexes per sitemaps.org spec.
 */

export interface SitemapResult {
  urls: string[];
  errors: number;
}

/**
 * Fetch and parse a sitemap (index or URL set) recursively.
 * Returns all discovered page URLs.
 */
export async function fetchSitemap(
  sitemapUrl: string,
  timeoutMs: number = 10_000,
  maxDepth: number = 3,
): Promise<SitemapResult> {
  const result: SitemapResult = { urls: [], errors: 0 };

  try {
    const response = await fetch(sitemapUrl, {
      headers: { "User-Agent": "ScreamingWeb/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return result;

    const xml = await response.text();

    // Check if this is a sitemap index (contains <sitemap> children)
    const isIndex = /<sitemapindex[\s>]/i.test(xml);

    if (isIndex && maxDepth > 0) {
      // Extract child sitemap URLs and recurse
      const childUrls = extractTags(xml, "loc");
      for (const childUrl of childUrls) {
        const child = await fetchSitemap(childUrl, timeoutMs, maxDepth - 1);
        result.urls.push(...child.urls);
        result.errors += child.errors;
      }
    } else {
      // URL set — extract page URLs
      result.urls = extractTags(xml, "loc");
    }
  } catch {
    result.errors++;
  }

  return result;
}

/**
 * Extract text content of XML tags. Simple regex-based extraction
 * to avoid needing a full XML parser dependency.
 */
function extractTags(xml: string, tag: string): string[] {
  const urls: string[] = [];
  const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const value = match[1].trim();
    if (value) urls.push(value);
  }

  return urls;
}
