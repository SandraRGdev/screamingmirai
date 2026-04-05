import { describe, it, expect } from "vitest";
import {
  exportAsJson,
  exportAsCsv,
  generateExportFilename,
} from "@/utils/export";
import type { CrawlResult } from "@/lib/types";

const mockResults: CrawlResult[] = [
  {
    url: "https://example.com",
    status: 200,
    contentType: "text/html",
    depth: 0,
    title: "Home",
    canonical: null,
    metaRobots: null,
    esIndexable: true,
    inlinks: 0,
    discoveredFrom: null,
  },
  {
    url: "https://example.com/about",
    status: 200,
    contentType: "text/html",
    depth: 1,
    title: "About Us",
    canonical: "https://example.com/about",
    metaRobots: "noindex",
    esIndexable: false,
    inlinks: 3,
    discoveredFrom: "https://example.com",
  },
];

describe("exportAsJson", () => {
  it("exports valid JSON", () => {
    const json = exportAsJson(mockResults);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(2);
  });

  it("includes metadata", () => {
    const json = exportAsJson(mockResults);
    const parsed = JSON.parse(json);
    expect(parsed.total).toBe(2);
    expect(parsed.exportedAt).toBeDefined();
  });

  it("preserves URL data", () => {
    const json = exportAsJson(mockResults);
    const parsed = JSON.parse(json);
    expect(parsed.results[0].url).toBe("https://example.com");
  });

  it("handles empty results", () => {
    const json = exportAsJson([]);
    const parsed = JSON.parse(json);
    expect(parsed.total).toBe(0);
    expect(parsed.results).toHaveLength(0);
  });
});

describe("exportAsCsv", () => {
  it("starts with BOM", () => {
    const csv = exportAsCsv(mockResults);
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("has header row", () => {
    const csv = exportAsCsv(mockResults);
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toContain("URL");
    expect(firstLine).toContain("Status");
    expect(firstLine).toContain("Title");
  });

  it("includes data rows", () => {
    const csv = exportAsCsv(mockResults);
    const lines = csv.split("\n");
    // BOM + header + 2 data rows = 4 lines (last may be empty)
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(csv).toContain("https://example.com");
    expect(csv).toContain("https://example.com/about");
  });

  it("escapes commas in values", () => {
    const withComma: CrawlResult = {
      ...mockResults[0],
      title: "Hello, world",
    };
    const csv = exportAsCsv([withComma]);
    expect(csv).toContain('"Hello, world"');
  });

  it("escapes quotes in values", () => {
    const withQuote: CrawlResult = {
      ...mockResults[0],
      title: 'Say "hello"',
    };
    const csv = exportAsCsv([withQuote]);
    expect(csv).toContain('"Say ""hello"""');
  });

  it("escapes newlines in values", () => {
    const withNewline: CrawlResult = {
      ...mockResults[0],
      title: "line1\nline2",
    };
    const csv = exportAsCsv([withNewline]);
    // Newlines replaced with spaces inside quotes
    expect(csv).toContain("line1 line2");
  });

  it("shows Indexable as Yes/No", () => {
    const csv = exportAsCsv(mockResults);
    expect(csv).toContain("Yes");
    expect(csv).toContain("No");
  });

  it("handles empty results", () => {
    const csv = exportAsCsv([]);
    // BOM + header row, no data rows
    expect(csv).toContain("URL");
    expect(csv).not.toContain("https://");
  });
});

describe("generateExportFilename", () => {
  it("includes domain and date", () => {
    const filename = generateExportFilename("https://example.com", "csv");
    expect(filename).toMatch(/screamingweb-example\.com-\d{4}-\d{2}-\d{2}\.csv/);
  });

  it("strips www prefix", () => {
    const filename = generateExportFilename("https://www.example.com", "json");
    expect(filename).toContain("example.com");
    expect(filename).not.toContain("www.");
  });

  it("uses correct extension", () => {
    expect(generateExportFilename("https://example.com", "csv")).toMatch(
      /\.csv$/,
    );
    expect(generateExportFilename("https://example.com", "json")).toMatch(
      /\.json$/,
    );
  });

  it("handles empty seedUrl gracefully", () => {
    const filename = generateExportFilename("", "csv");
    expect(filename).toContain("export");
  });
});
