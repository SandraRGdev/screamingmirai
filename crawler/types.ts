/**
 * Crawler-internal types. Shared types (CrawlResult, CrawlSession) live in lib/types.ts
 */

export interface QueueItem {
  url: string;
  depth: number;
  discoveredFrom: string | null; // null = seed, "sitemap" = from sitemap.xml, URL = parent page
}

export interface CrawlerConfig {
  seedUrl: string;
  maxDepth: number;
  maxPages: number;
  userAgent: string;
  sameDomainOnly: boolean;
  blockedExtensions: Set<string>;
  /** Use Playwright for all pages (force JS rendering) */
  useJs: boolean;
  /** Respect robots.txt rules and crawl-delay */
  respectRobotsTxt: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
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

/** Default blocked extensions — non-HTML resources to skip */
export const DEFAULT_BLOCKED_EXTENSIONS = new Set([
  // Images
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".bmp",
  ".tiff",
  // Styles & Scripts
  ".css",
  ".js",
  ".mjs",
  // Documents
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  // Media
  ".mp3",
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".wav",
  ".ogg",
  // Archives
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  // Fonts
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  // Data
  ".json",
  ".xml",
  ".rss",
  ".atom",
  ".txt",
  ".swf",
]);
