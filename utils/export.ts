import type { CrawlResult } from "@/lib/types";

export function exportAsJson(results: CrawlResult[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      total: results.length,
      results,
    },
    null,
    2,
  );
}

export function exportAsCsv(results: CrawlResult[]): string {
  const BOM = "\uFEFF";
  const headers = [
    "URL",
    "Status",
    "Content Type",
    "Depth",
    "Title",
    "Canonical",
    "Meta Robots",
    "Indexable",
    "Inlinks",
  ];

  const escape = (value: string | null | number | boolean): string => {
    const str = String(value ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
    }
    return str;
  };

  const rows = results.map((r) =>
    [
      escape(r.url),
      escape(r.status),
      escape(r.contentType),
      escape(r.depth),
      escape(r.title),
      escape(r.canonical),
      escape(r.metaRobots),
      escape(r.esIndexable ? "Yes" : "No"),
      escape(r.inlinks),
    ].join(","),
  );

  return BOM + [headers.join(","), ...rows].join("\n");
}

export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateExportFilename(
  seedUrl: string,
  format: "csv" | "json",
): string {
  let domain = "export";
  try {
    domain = new URL(seedUrl).hostname.replace(/^www\./, "");
  } catch {
    // seedUrl empty or invalid — use fallback
  }
  const date = new Date().toISOString().split("T")[0];
  return `screamingweb-${domain}-${date}.${format}`;
}
