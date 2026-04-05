import { describe, it, expect } from "vitest";
import { parseHtml, isIndexable } from "@/crawler/parser";
import type { FetchResult } from "@/crawler/types";

const baseHtml: FetchResult = {
  html: '<html><head><title>Test Page</title><link rel="canonical" href="https://example.com/canonical" /></head><body><a href="/page1">Internal</a><a href="https://other.com">External</a></body></html>',
  status: 200,
  contentType: "text/html",
  url: "https://example.com",
};

describe("parseHtml", () => {
  it("extracts title", () => {
    const result = parseHtml(baseHtml, 0, "example.com");
    expect(result.title).toBe("Test Page");
  });

  it("extracts canonical URL", () => {
    const result = parseHtml(baseHtml, 0, "example.com");
    expect(result.canonical).toBe("https://example.com/canonical");
  });

  it("extracts internal links", () => {
    const result = parseHtml(baseHtml, 0, "example.com");
    expect(result.internalLinks).toContain("https://example.com/page1");
  });

  it("extracts external links", () => {
    const result = parseHtml(baseHtml, 0, "example.com");
    expect(result.externalLinks).toContain("https://other.com");
  });

  it("deduplicates internal links", () => {
    const dupHtml: FetchResult = {
      ...baseHtml,
      html: '<html><body><a href="/page1">A</a><a href="/page1">B</a></body></html>',
    };
    const result = parseHtml(dupHtml, 0, "example.com");
    const page1Count = result.internalLinks.filter(
      (l) => l === "https://example.com/page1",
    ).length;
    expect(page1Count).toBe(1);
  });

  it("skips javascript: links", () => {
    const jsHtml: FetchResult = {
      ...baseHtml,
      html: '<html><body><a href="javascript:void(0)">Click</a></body></html>',
    };
    const result = parseHtml(jsHtml, 0, "example.com");
    expect(result.internalLinks).toHaveLength(0);
    expect(result.externalLinks).toHaveLength(0);
  });

  it("skips mailto: links", () => {
    const mailHtml: FetchResult = {
      ...baseHtml,
      html: '<html><body><a href="mailto:test@example.com">Email</a></body></html>',
    };
    const result = parseHtml(mailHtml, 0, "example.com");
    expect(result.internalLinks).toHaveLength(0);
  });

  it("handles missing title", () => {
    const noTitle: FetchResult = {
      ...baseHtml,
      html: "<html><body></body></html>",
    };
    const result = parseHtml(noTitle, 0, "example.com");
    expect(result.title).toBeNull();
  });

  it("preserves depth", () => {
    const result = parseHtml(baseHtml, 3, "example.com");
    expect(result.depth).toBe(3);
  });

  it("handles empty body", () => {
    const emptyHtml: FetchResult = {
      ...baseHtml,
      html: "<html><head><title>Empty</title></head><body></body></html>",
    };
    const result = parseHtml(emptyHtml, 0, "example.com");
    expect(result.title).toBe("Empty");
    expect(result.internalLinks).toHaveLength(0);
  });
});

describe("isIndexable", () => {
  it("returns true when no meta robots", () => {
    expect(isIndexable(null)).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(isIndexable("")).toBe(true);
  });

  it("returns true for index, follow", () => {
    expect(isIndexable("index, follow")).toBe(true);
  });

  it("returns false for noindex", () => {
    expect(isIndexable("noindex, follow")).toBe(false);
  });

  it("returns false for none", () => {
    expect(isIndexable("none")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isIndexable("NOINDEX")).toBe(false);
  });
});
