/** Single source of truth for all shared types. Crawler-internal types live in crawler/types.ts */

export interface CrawlResult {
  url: string;
  status: number;
  contentType: string;
  depth: number;
  title: string | null;
  canonical: string | null;
  metaRobots: string | null;
  lang: string | null;
  hreflang: { lang: string; href: string }[];
  esIndexable: boolean;
  inlinks: number;
  discoveredFrom: string | null;
}

export interface CrawlSession {
  id: string;
  status: "idle" | "running" | "completed" | "stopped" | "error";
  seedUrl: string;
  config: {
    maxDepth: number;
    maxPages: number;
    useJs: boolean;
    respectRobotsTxt: boolean;
  };
  results: CrawlResult[];
  stats: {
    pagesCrawled: number;
    pagesDiscovered: number;
    pagesFailed: number;
    currentDepth: number;
  };
  startedAt: Date | null;
  completedAt: Date | null;
}

export type CrawlStatus = CrawlSession["status"];
