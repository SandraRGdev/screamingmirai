"use client";

import { useState, useMemo } from "react";
import { type SortingState } from "@tanstack/react-table";
import { DataTable } from "./table/data-table";
import { columns } from "./table/columns";
import { TableToolbar } from "./table/table-toolbar";
import { TableFilters } from "./table/table-filters";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useExport } from "@/hooks/use-export";
import type { CrawlResult } from "@/lib/types";

const PAGE_SIZE = 50;

export function CrawlResultsTable({
  results,
  seedUrl,
}: {
  results: CrawlResult[];
  seedUrl: string;
}) {
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [statusFilter, setStatusFilter] = useState<number | null>(null);
  const [indexableFilter, setIndexableFilter] = useState<boolean | null>(null);
  const [langFilter, setLangFilter] = useState<string | null>(null);
  const { exportCsv, exportJson } = useExport(seedUrl);

  const uniqueStatuses = useMemo(
    () => [...new Set(results.map((r) => r.status))].sort((a, b) => a - b),
    [results],
  );

  const uniqueLangs = useMemo(() => {
    const langs = new Set<string>();
    for (const r of results) {
      if (r.lang) langs.add(r.lang);
      for (const h of r.hreflang) langs.add(h.lang);
    }
    return [...langs].sort();
  }, [results]);

  // Extract base path for grouping (removes language prefix like /ca/, /en/, etc.)
  const getBasePath = (url: string): string => {
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      // Remove language prefix if it's a language code
      const langCodes = ['es', 'ca', 'en', 'fr', 'de', 'it', 'pt'];
      if (pathParts.length > 0 && langCodes.includes(pathParts[0])) {
        return pathParts.slice(1).join('/');
      }
      return parsed.pathname;
    } catch {
      return url;
    }
  };

  const resetPage = () => setPageIndex(0);

  const filteredData = useMemo(() => {
    let data = results;

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (row) =>
          row.url.toLowerCase().includes(q) ||
          (row.title?.toLowerCase().includes(q) ?? false),
      );
    }

    if (statusFilter !== null) {
      data = data.filter((row) => row.status === statusFilter);
    }

    if (indexableFilter !== null) {
      data = data.filter((row) => row.esIndexable === indexableFilter);
    }

    if (langFilter !== null) {
      data = data.filter(
        (row) =>
          row.lang === langFilter ||
          row.hreflang.some((h) => h.lang === langFilter),
      );
    }

    return data;
  }, [results, search, statusFilter, indexableFilter, langFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);

  const paginatedData = filteredData.slice(
    safePageIndex * PAGE_SIZE,
    (safePageIndex + 1) * PAGE_SIZE,
  );

  const handleCopyUrls = async () => {
    const urls = filteredData.map((r) => r.url).join("\n");
    await navigator.clipboard.writeText(urls);
  };

  const clearFilters = () => {
    setStatusFilter(null);
    setIndexableFilter(null);
    setLangFilter(null);
    resetPage();
  };

  return (
    <div className="space-y-4">
      <TableToolbar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          resetPage();
        }}
        resultCount={filteredData.length}
        onExportCsv={() => exportCsv(filteredData)}
        onExportJson={() => exportJson(filteredData)}
        onCopyUrls={handleCopyUrls}
        filters={
          <TableFilters
            statusFilter={statusFilter}
            onStatusFilterChange={(v) => { setStatusFilter(v); resetPage(); }}
            uniqueStatuses={uniqueStatuses}
            indexableFilter={indexableFilter}
            onIndexableFilterChange={(v) => { setIndexableFilter(v); resetPage(); }}
            langFilter={langFilter}
            onLangFilterChange={(v) => { setLangFilter(v); resetPage(); }}
            uniqueLangs={uniqueLangs}
            onClearFilters={clearFilters}
          />
        }
      />

      <DataTable
        columns={columns}
        data={paginatedData}
        sorting={sorting}
        onSortingChange={setSorting}
      />

      <div className="flex items-center justify-end gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPageIndex(0)}
          disabled={safePageIndex === 0}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
          disabled={safePageIndex === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm px-2" aria-live="polite">
          Página {safePageIndex + 1} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
          disabled={safePageIndex >= totalPages - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPageIndex(totalPages - 1)}
          disabled={safePageIndex >= totalPages - 1}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
