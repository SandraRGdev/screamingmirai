import robotsParser from "robots-parser";

export interface RobotsConfig {
  isAllowed: (url: string) => boolean;
  getCrawlDelay: () => number;
  getSitemaps: () => string[];
}

const DEFAULT_ROBOTS: RobotsConfig = {
  isAllowed: () => true,
  getCrawlDelay: () => 0,
  getSitemaps: () => [],
};

/**
 * Fetch and parse robots.txt for a domain.
 * Returns a permissive config if robots.txt is missing or unreachable.
 */
export async function fetchRobotsTxt(
  seedUrl: string,
  userAgent: string = "ScreamingWeb/1.0",
): Promise<RobotsConfig> {
  const robotsUrl = new URL("/robots.txt", seedUrl).href;

  try {
    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return DEFAULT_ROBOTS;

    const text = await response.text();
    const parser = robotsParser(robotsUrl, text);

    // Extract sitemap URLs from robots.txt Sitemap directives
    const sitemapUrls = extractSitemapsFromText(text);

    return {
      isAllowed: (url: string) => parser.isAllowed(url, userAgent) ?? true,
      getCrawlDelay: () => (parser.getCrawlDelay(userAgent) as number) ?? 0,
      getSitemaps: () => sitemapUrls,
    };
  } catch {
    return DEFAULT_ROBOTS;
  }
}

/** Delay before next request if robots.txt specifies Crawl-delay */
export async function waitForCrawlDelay(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (delayMs <= 0) return;
  if (signal?.aborted) return;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Extract Sitemap: directive URLs from robots.txt text content.
 * These point to XML sitemap files that list additional page URLs.
 */
function extractSitemapsFromText(text: string): string[] {
  const urls: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^sitemap:/i.test(trimmed)) {
      const url = trimmed.substring(8).trim();
      if (url) urls.push(url);
    }
  }
  return urls;
}
