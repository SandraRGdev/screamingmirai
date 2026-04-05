import type { CrawlerConfig, ParsedResult } from "./types";
import { DEFAULT_BLOCKED_EXTENSIONS } from "./types";
import {
  normalizeUrl,
  isSameDomain,
  isBlockedExtension,
  getDomain,
  isSafeUrl,
} from "./url-utils";
import { hybridFetch } from "./hybrid-fetcher";
import { parseHtml } from "./parser";
import { fetchRobotsTxt, waitForCrawlDelay } from "./robots";
import { fetchSitemap } from "./sitemap";

/**
 * BFS crawler as an async generator. Yields ParsedResult for each page.
 * Stops when queue is empty, maxPages reached, maxDepth exceeded, or signal aborted.
 */
export async function* crawlGenerator(
  config: CrawlerConfig,
): AsyncGenerator<ParsedResult> {
  const seedDomain = getDomain(config.seedUrl);
  const seedNormalized = normalizeUrl(config.seedUrl);

  const queue: Array<{
    url: string;
    depth: number;
    discoveredFrom: string | null;
  }> = [{ url: seedNormalized, depth: 0, discoveredFrom: null }];

  const visited = new Set<string>();
  const queued = new Set<string>([seedNormalized]);
  const yielded = new Set<string>();

  // Track URL discovery count to debug duplicates
  const discoveryCount = new Map<string, number>();

  // Fetch robots.txt once per crawl if enabled
  const robots = config.respectRobotsTxt
    ? await fetchRobotsTxt(config.seedUrl, config.userAgent)
    : null;
  const crawlDelay = robots?.getCrawlDelay() ?? 0;

  // Seed queue with sitemap URLs (discovered from robots.txt Sitemap: directives)
  if (robots) {
    const sitemapUrls = robots.getSitemaps();
    console.log(`[SITEMAP] Found ${sitemapUrls.length} sitemap URLs`);
    for (const sitemapUrl of sitemapUrls) {
      console.log(`[SITEMAP] Fetching: ${sitemapUrl}`);
      const sitemapResult = await fetchSitemap(sitemapUrl);
      console.log(`[SITEMAP] Fetched ${sitemapResult.urls.length} URLs`);
      for (const url of sitemapResult.urls) {
        const normalized = normalizeUrl(url);
        if (
          !visited.has(normalized) &&
          !queued.has(normalized) &&
          isSameDomain(normalized, seedDomain) &&
          !isBlockedExtension(normalized, config.blockedExtensions) &&
          isSafeUrl(normalized)
        ) {
          queued.add(normalized);
          queue.push({ url: normalized, depth: 0, discoveredFrom: "sitemap" });
        }
      }
    }
  }

  while (queue.length > 0 && visited.size < config.maxPages) {
    if (config.signal?.aborted) return;

    const item = queue.shift()!;
    const normalized = normalizeUrl(item.url);

    // Debug: check if URL was discovered multiple times
    const prevCount = discoveryCount.get(normalized) ?? 0;
    discoveryCount.set(normalized, prevCount + 1);
    if (prevCount > 0) {
      console.error(`[MULTI-DISCOVERY] ${normalized} discovered ${prevCount + 1} times`);
    }

    if (visited.has(normalized)) {
      console.error(`[ALREADY VISITED] ${normalized}`);
      continue;
    }
    if (yielded.has(normalized)) {
      console.error(`[ALREADY YIELDED] ${normalized}`);
      continue;
    }
    if (item.depth > config.maxDepth) continue;
    if (config.sameDomainOnly && !isSameDomain(normalized, seedDomain)) continue;
    if (isBlockedExtension(normalized, config.blockedExtensions)) continue;

    // SSRF protection
    if (!isSafeUrl(normalized)) continue;

    // robots.txt check
    if (robots && !robots.isAllowed(normalized)) continue;

    visited.add(normalized);
    queued.delete(normalized);

    // Respect crawl-delay
    if (crawlDelay > 0) {
      await waitForCrawlDelay(crawlDelay, config.signal).catch(() => {});
    }

    const fetchResult = await hybridFetch(normalized, config.userAgent, {
      forceJs: config.useJs,
    });
    if (!fetchResult) continue;

    const parsed = parseHtml(fetchResult, item.depth, seedDomain);

    // Don't yield the same URL twice
    if (yielded.has(normalized)) {
      console.error(`[DUPLICATE] Already yielded: ${normalized}`);
      continue;
    }
    yielded.add(normalized);

    yield parsed;

    console.log(`[CRAWL] Queue size: ${queue.length}, Visited: ${visited.size}, Queued Set: ${queued.size}`);
    for (const link of parsed.internalLinks) {
      const linkNormalized = normalizeUrl(link);
      if (!visited.has(linkNormalized) && !queued.has(linkNormalized)) {
        queued.add(linkNormalized);
        queue.push({
          url: linkNormalized,
          depth: item.depth + 1,
          discoveredFrom: normalized,
        });
      }
    }
    queued.delete(normalized);
  }
}

/** Create a CrawlerConfig with sensible defaults */
export function createConfig(partial: Partial<CrawlerConfig> = {}): CrawlerConfig {
  return {
    seedUrl: partial.seedUrl || "https://example.com",
    maxDepth: partial.maxDepth ?? 3,
    maxPages: partial.maxPages ?? 500,
    userAgent: partial.userAgent || "ScreamingWeb/1.0",
    sameDomainOnly: partial.sameDomainOnly ?? true,
    blockedExtensions: partial.blockedExtensions || DEFAULT_BLOCKED_EXTENSIONS,
    useJs: partial.useJs ?? false,
    respectRobotsTxt: partial.respectRobotsTxt ?? true,
    signal: partial.signal,
  };
}
