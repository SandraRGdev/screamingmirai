import { beforeEach, describe, expect, it, vi } from "vitest";
import { crawlGenerator, createConfig } from "@/crawler/bfs";
import { hybridFetch } from "@/crawler/hybrid-fetcher";
import type { ParsedResult } from "@/crawler/types";

vi.mock("@/crawler/hybrid-fetcher", () => ({
  hybridFetch: vi.fn(),
}));

const hybridFetchMock = vi.mocked(hybridFetch);

const seedHtml =
  '<html><head><title>Home</title></head><body><a href="/alias-1">A</a><a href="/alias-2">B</a></body></html>';
const detailHtml = '<html><head><title>Offers</title></head><body></body></html>';

describe("crawlGenerator", () => {
  beforeEach(() => {
    hybridFetchMock.mockReset();
    hybridFetchMock.mockImplementation(async (url: string) => {
      if (url === "https://example.com") {
        return {
          html: seedHtml,
          status: 200,
          contentType: "text/html",
          url: "https://example.com/",
        };
      }

      if (url === "https://example.com/alias-1") {
        return {
          html: detailHtml,
          status: 200,
          contentType: "text/html",
          url: "https://example.com/ofertas/",
        };
      }

      if (url === "https://example.com/alias-2") {
        return {
          html: detailHtml,
          status: 200,
          contentType: "text/html",
          url: "https://example.com/ofertas/",
        };
      }

      return null;
    });
  });

  it("deduplicates pages that resolve to the same final URL", async () => {
    const results: ParsedResult[] = [];
    const config = createConfig({
      seedUrl: "https://example.com",
      maxDepth: 1,
      maxPages: 10,
      respectRobotsTxt: false,
    });

    for await (const page of crawlGenerator(config)) {
      results.push(page);
    }

    expect(results.map((page) => page.url)).toEqual([
      "https://example.com",
      "https://example.com/ofertas",
    ]);
  });
});
