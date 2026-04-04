---
title: "Phase 7: Export & In-Memory Store"
description: "Implement CSV/JSON export and optimize in-memory session storage"
status: pending
priority: P1
effort: 4h
branch: feature/export-store
version: v0.7.0
tags: [export, csv, json, storage]
created: 2026-04-04
---

# Phase 7: Export & In-Memory Store

## Context

**Related Reports:**
- `researcher-crawler-architecture-report.md` — Sections 4-5 (In-memory state, export patterns)
- `researcher-screaming-web-full-report.md` — Section 11 (Export — CSV & JSON)

**Overview:**
Implement CSV/JSON export functionality and optimize the in-memory session store with proper cleanup and management.

## Key Insights

1. Client-side export using Blob API (no server needed)
2. CSV generation can be done with simple string manipulation
3. In-memory store needs cleanup for old sessions
4. Export filename should include timestamp
5. Client-side filtering before export (export only visible rows)

## Requirements

### Functional Requirements
- Export results as CSV
- Export results as JSON
- Export all results or filtered results only
- Filename with timestamp
- Session cleanup (auto-delete old sessions)

### Non-Functional Requirements
- Each file under 200 lines
- Export works on large datasets (tested up to 10K rows)

## Architecture

### Data Flow

```
User clicks "Export"
  ↓
Get current results (filtered or all)
  ↓
Convert to CSV or JSON
  ↓
Create Blob with appropriate MIME type
  ↓
Trigger download via hidden <a> tag
```

### Module Structure

```
utils/
├── export.ts          # CSV/JSON export utilities
└── format.ts          # Data formatting helpers
store/
└── crawl-session.ts   # Enhanced with cleanup
```

## Related Code Files

### Files to Create
- `utils/export.ts`
- `utils/format.ts`

### Files to Modify
- `store/crawl-session.ts` — Add cleanup logic
- `components/crawl-results-table.tsx` — Wire up export handlers
- `components/table/table-toolbar.tsx` — Add format selector

## Implementation Steps

1. **Create export utilities** — `utils/export.ts`:
   ```ts
   import type { CrawlResult } from '@/lib/types';

   export function exportAsJson(results: CrawlResult[]): string {
     return JSON.stringify(
       {
         exportedAt: new Date().toISOString(),
         total: results.length,
         results,
       },
       null,
       2
     );
   }

   export function exportAsCsv(results: CrawlResult[]): string {
     const headers = [
       'URL',
       'Status',
       'Content Type',
       'Depth',
       'Title',
       'Canonical',
       'Meta Robots',
       'Indexable',
       'Inlinks',
     ];

     const escape = (value: string | null | number): string => {
       const str = String(value ?? '');
       if (str.includes(',') || str.includes('"') || str.includes('\n')) {
         return `"${str.replace(/"/g, '""')}"`;
       }
       return str;
     };

     const rows = results.map((r) => [
       escape(r.url),
       escape(r.status),
       escape(r.contentType),
       escape(r.depth),
       escape(r.title),
       escape(r.canonical),
       escape(r.metaRobots),
       escape(r.esIndexable ? 'Yes' : 'No'),
       escape(r.inlinks),
     ]);

     return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
   }

   export function downloadFile(
     content: string,
     filename: string,
     mimeType: string
   ): void {
     const blob = new Blob([content], { type: mimeType });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = filename;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
   }

   export function generateFilename(
     seedUrl: string,
     format: 'csv' | 'json'
   ): string {
     const domain = new URL(seedUrl).hostname.replace(/^www\./, '');
     const date = new Date().toISOString().split('T')[0];
     return `screamingweb-${domain}-${date}.${format}`;
   }
   ```

2. **Create format utilities** — `utils/format.ts`:
   ```ts
   export function formatNumber(num: number): string {
     return new Intl.NumberFormat('en-US').format(num);
   }

   export function formatBytes(bytes: number): string {
     if (bytes === 0) return '0 B';
     const k = 1024;
     const sizes = ['B', 'KB', 'MB', 'GB'];
     const i = Math.floor(Math.log(bytes) / Math.log(k));
     return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
   }

   export function truncate(str: string | null, max: number): string {
     if (!str) return '';
     return str.length > max ? str.slice(0, max) + '...' : str;
   }
   ```

3. **Enhance session store** — `store/crawl-session.ts`:
   ```ts
   // Add to existing imports
   import { setTimeout, clearTimeout } from 'node:timers';

   // Add cleanup interval
   const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

   function startCleanupInterval(): void {
     setInterval(() => {
       const now = Date.now();
       for (const [id, session] of sessions.entries()) {
         const completedAt = session.completedAt?.getTime() ?? 0;
         if (
           session.status === 'completed' &&
           now - completedAt > SESSION_TTL_MS
         ) {
           sessions.delete(id);
         }
       }
     }, 5 * 60 * 1000); // Check every 5 minutes
   }

   // Start cleanup on module load
   startCleanupInterval();

   // Add to exports
   export function getActiveSessionCount(): number {
     return Array.from(sessions.values()).filter(
       (s) => s.status === 'running'
     ).length;
   }
   ```

4. **Create export hook** — `hooks/use-export.ts`:
   ```ts
   'use client';

   import { exportAsJson, exportAsCsv, downloadFile, generateFilename } from '@/utils/export';
   import type { CrawlResult } from '@/lib/types';

   export function useExport(seedUrl: string) {
     const exportJson = (results: CrawlResult[]) => {
       const content = exportAsJson(results);
       const filename = generateFilename(seedUrl, 'json');
       downloadFile(content, filename, 'application/json');
     };

     const exportCsv = (results: CrawlResult[]) => {
       const content = exportAsCsv(results);
       const filename = generateFilename(seedUrl, 'csv');
       downloadFile(content, filename, 'text/csv');
     };

     return { exportJson, exportCsv };
   }
   ```

5. **Update table toolbar** — `components/table/table-toolbar.tsx`:
   ```ts
   'use client';

   import { Input } from '@/components/ui/input';
   import { Button } from '@/components/ui/button';
   import {
     Select,
     SelectContent,
     SelectItem,
     SelectTrigger,
     SelectValue,
   } from '@/components/ui/select';

   export type ExportFormat = 'csv' | 'json';

   export function TableToolbar({
     search,
     onSearchChange,
     onExport,
     exportFormat,
     onExportFormatChange,
   }: {
     search: string;
     onSearchChange: (value: string) => void;
     onExport: () => void;
     exportFormat: ExportFormat;
     onExportFormatChange: (format: ExportFormat) => void;
   }) {
     return (
       <div className="flex items-center justify-between py-4">
         <Input
           placeholder="Filter URLs..."
           value={search}
           onChange={(e) => onSearchChange(e.target.value)}
           className="max-w-sm"
         />
         <div className="flex items-center gap-2">
           <Select
             value={exportFormat}
             onValueChange={(v: 'csv' | 'json') => onExportFormatChange(v)}
           >
             <SelectTrigger className="w-[120px]">
               <SelectValue placeholder="Format" />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="csv">CSV</SelectItem>
               <SelectItem value="json">JSON</SelectItem>
             </SelectContent>
           </Select>
           <Button onClick={onExport}>Export</Button>
         </div>
       </div>
     );
   }
   ```

6. **Update results table** — `components/crawl-results-table.tsx`:
   ```ts
   // Add imports
   import { useExport } from '@/hooks/use-export';
   import { TableToolbar, type ExportFormat } from './table/table-toolbar';

   // Inside component
   const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
   const { exportCsv, exportJson } = useExport('https://example.com'); // Will pass real URL

   const handleExport = () => {
     const dataToExport = search ? filteredData : data;
     if (exportFormat === 'csv') {
       exportCsv(dataToExport);
     } else {
       exportJson(dataToExport);
     }
   };

   // Update toolbar usage
   <TableToolbar
     search={search}
     onSearchChange={setSearch}
     onExport={handleExport}
     exportFormat={exportFormat}
     onExportFormatChange={setExportFormat}
   />
   ```

## Success Criteria

- [ ] CSV export works with proper escaping
- [ ] JSON export is formatted and readable
- [ ] Filename includes domain and date
- [ ] Export handles filtered results
- [ ] Old sessions auto-delete after 1 hour
- [ ] All files under 200 lines

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CSV escaping issues | Low | Medium | Test with commas, quotes in titles |
| Large export freezes UI | Medium | Low | Add loading indicator |
| Session cleanup fails | Low | Low | Log errors, continue |

## Rollback Plan

If export has bugs:
1. Use browser's native JSON stringify
2. Simplify CSV to tab-separated

## Dependencies

- **Blocked by:** Phase 6 (results table)
- **Blocks:** Phase 8 (Docker)
- **External:** None

## Next Steps

1. Merge `feature/export-store` → `develop`
2. Tag `v0.7.0` on merge
3. Create `feature/docker-dokploy` branch
4. Begin Phase 8
