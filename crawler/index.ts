export type {
  QueueItem,
  CrawlerConfig,
  FetchResult,
  ParsedResult,
} from "./types";
export { DEFAULT_BLOCKED_EXTENSIONS } from "./types";

export {
  normalizeUrl,
  getDomain,
  isSameDomain,
  isBlockedExtension,
  resolveUrl,
  isHtmlContentType,
  isPrivateHostname,
  isSafeUrl,
} from "./url-utils";

export { fetchPage } from "./fetcher";

export { parseHtml, isIndexable } from "./parser";

export { crawlGenerator, createConfig } from "./bfs";

export { hybridFetch } from "./hybrid-fetcher";
export type { HybridFetchResult } from "./hybrid-fetcher";

export { fetchWithPlaywright, closeBrowser } from "./playwright";

export { fetchRobotsTxt, waitForCrawlDelay } from "./robots";
export type { RobotsConfig } from "./robots";

export { fetchSitemap } from "./sitemap";
export type { SitemapResult } from "./sitemap";
