---
title: "Phase 6: UI — Results Table"
description: "Build sortable, filterable, paginated results table with TanStack Table + shadcn/ui"
status: pending
priority: P1
effort: 5h
branch: feature/ui-results-table
version: v0.6.0
tags: [nextjs, tanstack, table, ui]
created: 2026-04-04
---

# Phase 6: UI — Results Table

## Context

**Related Reports:**
- `researcher-shadcn-table-sse-report.md` — Sections 1-2 (DataTable setup, sorting/filtering)

**Overview:**
Implement a sortable, filterable, paginated results table using TanStack Table v8 and shadcn/ui DataTable components. Handles large result sets with server-side pagination.

## Key Insights

1. TanStack Table is headless — shadcn provides styled primitives
2. Server-side pagination required (large result sets)
3. `manualPagination: true` for server-controlled pages
4. Column sorting and filtering also server-side
5. Virtual scrolling not needed for <50K rows

## Requirements

### Functional Requirements
- Display crawled URLs with all fields
- Sortable columns (URL, status, depth, title, indexable)
- Global search filter
- Column-specific filters
- Pagination (50 rows per page)
- Export button (links to Phase 7)

### Non-Functional Requirements
- Each file under 200 lines
- Responsive layout
- Accessible table headers

## Architecture

### Data Flow

```
Component mounts
  ↓
GET /api/crawl/[id]/results?page=1&limit=50
  ↓
Display data in DataTable
  ↓
User sorts/filters → Refetch with query params
```

### Component Structure

```
components/
├── crawl-results-table.tsx   # Main table component
├── table/
│   ├── columns.tsx           # Column definitions
│   ├── data-table.tsx        # Generic DataTable wrapper
│   └── table-toolbar.tsx     # Search + filter UI
lib/
└── columns.ts                # Column definitions
```

## Related Code Files

### Files to Create
- `components/crawl-results-table.tsx`
- `components/table/columns.tsx`
- `components/table/data-table.tsx`
- `components/table/table-toolbar.tsx`

### Files to Modify
- `app/page.tsx` — Add table after crawl completes
- `hooks/use-crawl-results.ts` — New hook for fetching results

## Implementation Steps

1. **Add shadcn DataTable**
   ```bash
   npx shadcn@latest add table
   npm install @tanstack/react-table
   ```

2. **Create column definitions** — `components/table/columns.tsx`:
   ```ts
   'use client';

   import { ColumnDef } from '@tanstack/react-table';
   import { Badge } from '@/components/ui/badge';
   import type { CrawlResult } from '@/lib/types';

   export const columns: ColumnDef<CrawlResult>[] = [
     {
       accessorKey: 'url',
       header: 'URL',
       cell: ({ row }) => (
         <a
           href={row.getValue('url')}
           target="_blank"
           rel="noopener"
           className="text-blue-600 hover:underline truncate max-w-xs block"
         >
           {row.getValue('url')}
         </a>
       ),
     },
     {
       accessorKey: 'status',
       header: 'Status',
       cell: ({ row }) => {
         const status = row.getValue('number') as number;
         return (
           <Badge variant={status < 400 ? 'default' : 'destructive'}>
             {status}
           </Badge>
         );
       },
     },
     {
       accessorKey: 'depth',
       header: 'Depth',
     },
     {
       accessorKey: 'title',
       header: 'Title',
       cell: ({ row }) => (
         <span className="truncate max-w-xs block">
           {row.getValue('title') || '<em>none</em>'}
         </span>
       ),
     },
     {
       accessorKey: 'esIndexable',
       header: 'Indexable',
       cell: ({ row }) => (
         <Badge variant={row.getValue('esIndexable') ? 'default' : 'secondary'}>
           {row.getValue('esIndexable') ? 'Yes' : 'No'}
         </Badge>
       ),
     },
     {
       accessorKey: 'inlinks',
       header: 'Inlinks',
     },
   ];
   ```

3. **Create generic DataTable** — `components/table/data-table.tsx`:
   ```ts
   'use client';

   import {
     ColumnDef,
     flexRender,
     getCoreRowModel,
     useReactTable,
   } from '@tanstack/react-table';
   import {
     Table,
     TableBody,
     TableCell,
     TableHead,
     TableHeader,
     TableRow,
   } from '@/components/ui/table';

   export function DataTable<TData, TValue>({
     columns,
     data,
   }: {
     columns: ColumnDef<TData, TValue>[];
     data: TData[];
   }) {
     const table = useReactTable({
       data,
       columns,
       getCoreRowModel: getCoreRowModel(),
     });

     return (
       <div className="rounded-md border">
         <Table>
           <TableHeader>
             {table.getHeaderGroups().map((headerGroup) => (
               <TableRow key={headerGroup.id}>
                 {headerGroup.headers.map((header) => (
                   <TableHead key={header.id}>
                     {header.isPlaceholder
                       ? null
                       : flexRender(
                           header.column.columnDef.header,
                           header.getContext()
                         )}
                   </TableHead>
                 ))}
               </TableRow>
             ))}
           </TableHeader>
           <TableBody>
             {table.getRowModel().rows?.length ? (
               table.getRowModel().rows.map((row) => (
                 <TableRow key={row.id}>
                   {row.getVisibleCells().map((cell) => (
                     <TableCell key={cell.id}>
                       {flexRender(
                         cell.column.columnDef.cell,
                         cell.getContext()
                       )}
                     </TableCell>
                   ))}
                 </TableRow>
               ))
             ) : (
               <TableRow>
                 <TableCell
                   colSpan={columns.length}
                   className="h-24 text-center"
                 >
                   No results.
                 </TableCell>
               </TableRow>
             )}
           </TableBody>
         </Table>
       </div>
     );
   }
   ```

4. **Create results hook** — `hooks/use-crawl-results.ts`:
   > **no-use-effect compliance:** Uses React Query instead of useEffect for data fetching.

   ```ts
   'use client';

   import { useQuery } from '@tanstack/react-query';
   import type { CrawlResult } from '@/lib/types';

   export function useCrawlResults(crawlId: string | null, page: number = 1, limit: number = 50) {
     return useQuery({
       queryKey: ['crawl-results', crawlId, page, limit],
       queryFn: async () => {
         if (!crawlId) return { data: [], total: 0, page: 1, limit, totalPages: 0 };
         const res = await fetch(`/api/crawl/${crawlId}/results?page=${page}&limit=${limit}`);
         return res.json();
       },
       enabled: !!crawlId,
     });
   }
   ```

5. **Create table toolbar** — `components/table/table-toolbar.tsx`:
   ```ts
   'use client';

   import { Input } from '@/components/ui/input';
   import { Button } from '@/components/ui/button';

   export function TableToolbar({
     search,
     onSearchChange,
     onExport,
  }: {
    search: string;
    onSearchChange: (value: string) => void;
    onExport: () => void;
  }) {
    return (
      <div className="flex items-center justify-between py-4">
        <Input
          placeholder="Filter URLs..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={onExport}>Export</Button>
      </div>
    );
  }
   ```

6. **Create main results table** — `components/crawl-results-table.tsx`:
   ```ts
   'use client';

   import { useState } from 'react';
   import { DataTable } from './table/data-table';
   import { columns } from './table/columns';
   import { TableToolbar } from './table/table-toolbar';
   import { Button } from '@/components/ui/button';
   import {
     ChevronLeft,
     ChevronRight,
     ChevronsLeft,
     ChevronsRight,
   } from 'lucide-react';
   import type { CrawlResult } from '@/lib/types';

   export function CrawlResultsTable({
     crawlId,
  }: {
    crawlId: string;
  }) {
    // For now, client-side state (will upgrade to server-side in Phase 7)
    const [data, setData] = useState<CrawlResult[]>([]);
    const [search, setSearch] = useState('');
    const [pageIndex, setPageIndex] = useState(0);
    const pageSize = 50;

    // Filter data client-side
    const filteredData = data.filter((row) =>
      row.url.toLowerCase().includes(search.toLowerCase()) ||
      (row.title?.toLowerCase().includes(search.toLowerCase()) ?? false)
    );

    const paginatedData = filteredData.slice(
      pageIndex * pageSize,
      (pageIndex + 1) * pageSize
    );

    const totalPages = Math.ceil(filteredData.length / pageSize);

    return (
      <div className="space-y-4">
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          onExport={() => {/* Export handler in Phase 7 */}}
        />

        <DataTable columns={columns} data={paginatedData} />

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPageIndex(0)}
            disabled={pageIndex === 0}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Page {pageIndex + 1} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageIndex >= totalPages - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPageIndex(totalPages - 1)}
            disabled={pageIndex >= totalPages - 1}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }
   ```

7. **Update main page** — `app/page.tsx`:
   ```ts
   // Add to existing component
   import { CrawlResultsTable } from '@/components/crawl-results-table';

   // Inside component, after CrawlSummary:
   {state.status === 'completed' && crawlId && (
     <div className="mt-8">
       <CrawlResultsTable crawlId={crawlId} />
     </div>
   )}
   ```

8. **Add lucide-react icons**
   ```bash
   npm install lucide-react
   ```

## Success Criteria

- [ ] Table displays all crawled results
- [ ] Search filters by URL/title
- [ ] Pagination works correctly
- [ ] Export button present (handler in Phase 7)
- [ ] All files under 200 lines

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Client-side filtering slow on large sets | Medium | Medium | Move to server-side in Phase 7 |
| Memory issues with 10K+ rows | Medium | Low | Pagination limits visible rows |

## Rollback Plan

If table performance issues:
1. Reduce page size to 25
2. Add virtual scrolling with @tanstack/react-virtual

## Dependencies

- **Blocked by:** Phase 5 (UI crawl form)
- **Blocks:** Phase 7 (export)
- **External:** None

## Next Steps

1. Merge `feature/ui-results-table` → `develop`
2. Tag `v0.6.0` on merge
3. Create `feature/export-store` branch
4. Begin Phase 7
