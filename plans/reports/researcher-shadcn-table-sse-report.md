# Research Report: shadcn/ui DataTable + SSE/Streaming in Next.js App Router

**Date:** 2026-04-04
**Status:** Complete
**Sources:** shadcn/ui official docs, TanStack Table v8 docs, Next.js App Router docs

---

## Executive Summary

shadcn/ui DataTable is **not** a standalone component -- it is a pattern combining TanStack Table v8 (headless logic) with shadcn's `<Table />` primitives. For real-time crawl progress updates, Next.js App Router Route Handlers support SSE via `ReadableStream` natively. Server-side pagination/sorting/filtering uses TanStack's `manual*` flags. Below: concrete setup, patterns, and recommendations.

---

## 1. shadcn/ui DataTable Setup with TanStack Table

### Installation

```bash
pnpm dlx shadcn@latest add table
pnpm add @tanstack/react-table
```

This installs the shadcn `<Table>`, `<TableHeader>`, `<TableRow>`, etc. primitives plus TanStack Table v8.

### Recommended File Structure

```
app/
└── crawl-results/
    ├── columns.tsx       # "use client" - column definitions + cell renderers
    ├── data-table.tsx    # "use client" - generic DataTable<TData, TValue> component
    └── page.tsx          # server component - fetch data, render <DataTable>
```

**Why this split:** `page.tsx` is a server component that can fetch data server-side. `columns.tsx` and `data-table.tsx` must be client components because TanStack Table uses React state/hooks.

### Core DataTable Component (data-table.tsx)

```tsx
"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
```

### Column Definitions (columns.tsx)

```tsx
"use client"

import { ColumnDef } from "@tanstack/react-table"

export type CrawlResult = {
  id: string
  url: string
  statusCode: number
  title: string
  crawlTime: string
}

export const columns: ColumnDef<CrawlResult>[] = [
  { accessorKey: "url", header: "URL" },
  { accessorKey: "statusCode", header: "Status" },
  { accessorKey: "title", header: "Title" },
  { accessorKey: "crawlTime", header: "Crawled At" },
]
```

### Server Component Page (page.tsx)

```tsx
import { DataTable } from "./data-table"
import { columns } from "./columns"

// This is a server component -- fetch data here
async function getCrawlResults() {
  const res = await fetch("http://localhost:3000/api/crawl-results")
  return res.json()
}

export default async function CrawlResultsPage() {
  const data = await getCrawlResults()
  return (
    <div className="container mx-auto py-10">
      <DataTable columns={columns} data={data} />
    </div>
  )
}
```

---

## 2. Sorting, Filtering, and Pagination Patterns

### Full State Management (Client-Side)

For datasets that fit in memory (< 10k rows), all features run client-side:

```tsx
const [sorting, setSorting] = useState<SortingState>([])
const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
const [rowSelection, setRowSelection] = useState({})

const table = useReactTable({
  data,
  columns,
  state: { sorting, columnFilters, columnVisibility, rowSelection },
  onSortingChange: setSorting,
  onColumnFiltersChange: setColumnFilters,
  onColumnVisibilityChange: setColumnVisibility,
  onRowSelectionChange: setRowSelection,
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
})
```

Required imports:
```tsx
import {
  type SortingState, type ColumnFiltersState, type VisibilityState,
  getPaginationRowModel, getSortedRowModel, getFilteredRowModel,
} from "@tanstack/react-table"
```

### Server-Side Sorting/Filtering/Pagination

For large datasets (crawl results can be thousands-millions of rows), use server-side operations:

```tsx
const table = useReactTable({
  data,            // only the current page of data from server
  columns,
  pageCount: totalPages,    // total pages from server response
  manualSorting: true,      // disables client-side sort
  manualFiltering: true,    // disables client-side filter
  manualPagination: true,   // disables client-side pagination
  getCoreRowModel: getCoreRowModel(),
  state: { sorting, columnFilters, pagination },
  onSortingChange: (updater) => {
    setSorting(updater)
    fetchServerData({ sorting: updater, columnFilters, pagination })
  },
  onColumnFiltersChange: (updater) => {
    setColumnFilters(updater)
    fetchServerData({ sorting, columnFilters: updater, pagination })
  },
  onPaginationChange: (updater) => {
    setPagination(updater)
    fetchServerData({ sorting, columnFilters, pagination: updater })
  },
})
```

**Key flags:**
| Flag | Effect |
|------|--------|
| `manualPagination: true` | Table expects pre-paginated data; use `pageCount` for page count |
| `manualSorting: true` | Table expects pre-sorted data from server |
| `manualFiltering: true` | Table expects pre-filtered data from server |

### Recommendation for ScreamingWeb

**Use server-side pagination + sorting + filtering.** Crawl results grow fast. Client-side filtering on 50k+ rows will freeze the browser. The `manual*` flags are trivial to set up.

Fetch signature should be:
```
GET /api/crawl-results?page=1&pageSize=50&sort=url&sortDir=asc&filter[url]=example.com
```

Return shape:
```json
{
  "data": [...],
  "totalPages": 100,
  "totalRows": 5000
}
```

### Reusable Sub-Components (from shadcn docs)

shadcn provides three reusable components for the full-featured table:

1. **DataTableColumnHeader** -- DropdownMenu with sort asc/desc/hide column
2. **DataTablePagination** -- Rows per page select, page X of Y, nav buttons
3. **DataTableViewOptions** -- Dropdown to toggle column visibility

These are copy-paste components from the shadcn docs, not installed via CLI. Place in `components/` directory.

---

## 3. Real-Time Data Updates: SSE/Streaming in Next.js App Router

### Route Handler Streaming (Official Next.js Pattern)

Next.js Route Handlers support `ReadableStream` natively:

```tsx
// app/api/crawl-progress/route.ts
const encoder = new TextEncoder()

function streamToIterator(stream: ReadableStream) {
  const reader = stream.getReader()
  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        yield value
      }
    },
  }
}

async function* crawlEventGenerator(crawlId: string) {
  while (true) {
    const status = await getCrawlStatus(crawlId)
    if (status.complete) {
      yield encoder.encode(`data: ${JSON.stringify(status)}\n\n`)
      break
    }
    yield encoder.encode(`data: ${JSON.stringify(status)}\n\n`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const crawlId = searchParams.get("crawlId")

  const iterator = crawlEventGenerator(crawlId!)
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()
      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
```

### Client-Side SSE Consumer

```tsx
"use client"

import { useEffect, useState } from "react"

type CrawlProgress = {
  urlsCrawled: number
  totalUrls: number
  currentUrl: string
  complete: boolean
  results: CrawlResult[]
}

export function useCrawlProgress(crawlId: string | null) {
  const [progress, setProgress] = useState<CrawlProgress | null>(null)

  useEffect(() => {
    if (!crawlId) return

    const eventSource = new EventSource(
      `/api/crawl-progress?crawlId=${crawlId}`
    )

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setProgress(data)
      if (data.complete) {
        eventSource.close()
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => eventSource.close()
  }, [crawlId])

  return progress
}
```

### Alternative: Direct fetch + ReadableStream Reader

If you need more control than `EventSource` provides (e.g., custom headers, POST method):

```tsx
useEffect(() => {
  if (!crawlId) return

  fetch(`/api/crawl-progress?crawlId=${crawlId}`)
    .then((res) => {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) return
          const text = decoder.decode(value)
          // Parse SSE format: "data: {...}\n\n"
          const lines = text.split("\n").filter((l) => l.startsWith("data: "))
          for (const line of lines) {
            const json = JSON.parse(line.slice(6))
            setProgress(json)
          }
          read()
        })
      }
      read()
    })

  return () => { /* abort controller */ }
}, [crawlId])
```

### SSE vs WebSocket vs Polling -- Trade-Offs

| Dimension | SSE | WebSocket | Polling |
|-----------|-----|-----------|---------|
| Direction | Server-to-client only | Bidirectional | Client pulls |
| Complexity | Low | Medium (connection mgmt, reconnection) | Lowest |
| Next.js Support | Native (Route Handlers) | Requires custom server or 3rd party | Native |
| HTTP/2 multiplexing | Yes | No (upgrade) | Yes |
| Auto-reconnect | EventSource built-in | Manual | N/A |
| Binary data | No | Yes | Yes |
| Best for | Progress updates, notifications | Chat, collaborative editing | Low-frequency updates |

**Recommendation for ScreamingWeb:** Use **SSE**. Crawl progress is a server-to-client stream. SSE is simpler, works with Next.js App Router without extra infrastructure, and `EventSource` auto-reconnects.

---

## 4. Integration Architecture for ScreamingWeb

```
User clicks "Start Crawl"
        │
        ▼
POST /api/crawls  →  { crawlId: "abc" }
        │
        ▼
Client subscribes: EventSource(/api/crawl-progress?crawlId=abc)
        │
        ▼
Server streams progress updates every 1s (or per-URL):
  { urlsCrawled: 1, totalUrls: 500, currentUrl: "...", complete: false }
  { urlsCrawled: 2, totalUrls: 500, currentUrl: "...", complete: false }
  ...
  { urlsCrawled: 500, totalUrls: 500, complete: true }
        │
        ▼
Client updates DataTable in real-time:
  - During crawl: show streaming results
  - After crawl: switch to server-side paginated table
```

### Key Implementation Decisions

1. **During crawl:** Client accumulates results from SSE stream, feeds into DataTable with client-side sorting/filtering (small window of visible results). Use a hybrid approach -- SSE pushes new rows, client appends to local state.

2. **After crawl:** Switch to server-side paginated table hitting `GET /api/crawl-results?page=1&pageSize=50&...`. Full dataset is too large for client memory.

3. **State transition:** SSE stream sends `complete: true` -- client triggers a refetch of page 1 from the paginated API, then disables the SSE listener.

---

## 5. Concrete Recommendations

### Ranked Choices

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Table library | TanStack Table v8 + shadcn primitives | Headless = full control; shadcn provides styled primitives; no vendor lock-in |
| 2 | Pagination model | Server-side (`manualPagination: true`) | Crawl results = large datasets; client-side pagination fails at scale |
| 3 | Sorting model | Server-side (`manualSorting: true`) | Must sort across all data, not just current page |
| 4 | Filtering model | Server-side (`manualFiltering: true`) | Same reason as sorting |
| 5 | Real-time updates | SSE via Route Handler ReadableStream | Simplest, native Next.js support, auto-reconnect, fits the unidirectional data flow |
| 6 | SSE client | `EventSource` API | Built-in browser API, auto-reconnect, sufficient for GET-based streams |

### Adoption Risk

- **TanStack Table v8:** Low risk. Mature, stable API, large community, actively maintained. v9 is in beta but v8 is production-ready.
- **shadcn/ui DataTable:** Low risk. Not a dependency -- it is copy-paste code you own. No version lock-in.
- **SSE in Next.js Route Handlers:** Low-medium risk. Supported since Next.js 13. Streaming API is stable. Some edge runtime limitations (use Node.js runtime for long-lived connections).
- **`EventSource` browser API:** Zero risk. Supported in all modern browsers.

### Limitations

- This report does not cover: authentication on SSE endpoints, horizontal scaling of SSE connections (requires pub/sub like Redis for multi-instance), or rate limiting.
- Does not cover WebSocket patterns (unnecessary for this use case).
- Does not cover TanStack Table v9 beta features.
- Does not cover deployment-specific concerns (Vercel serverless function timeout limits may affect long-running SSE connections; consider Vercel Flex or self-hosted for crawls > 30s).

---

## Unresolved Questions

1. What is the expected crawl duration and result set size? This determines whether SSE connections will hit deployment platform timeouts.
2. Will the crawl run server-side (in the Next.js process) or in a separate worker/queue? This affects SSE architecture significantly.
3. Does the deployment target support long-lived HTTP connections? (Vercel serverless has 10-30s limits; Vercel Flex or self-hosted does not.)

---

**Sources:**
- shadcn/ui DataTable: https://ui.shadcn.com/docs/components/data-table
- TanStack Table v8 Sorting: https://tanstack.com/table/latest/docs/guide/sorting
- TanStack Table v8 Pagination: https://tanstack.com/table/latest/docs/guide/pagination
- TanStack Table v8 Column Filtering: https://tanstack.com/table/latest/docs/guide/column-filtering
- Next.js Route Handlers (Streaming): https://nextjs.org/docs/app/building-your-application/routing/route-handlers#streaming
