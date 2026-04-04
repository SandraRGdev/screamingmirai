---
title: "Phase 4: API Routes & SSE Streaming"
description: "Create Next.js API routes with Server-Sent Events for real-time crawl progress"
status: pending
priority: P1
effort: 5h
branch: feature/api-streaming
version: v0.4.0
tags: [nextjs, api, sse, streaming]
created: 2026-04-04
---

# Phase 4: API Routes & SSE Streaming

## Context

**Related Reports:**
- `researcher-screaming-web-full-report.md` — Section 1 (Streaming pattern for SSE)
- `researcher-shadcn-table-sse-report.md` — Section 3 (SSE in Next.js Route Handlers)

**Overview:**
Implement Next.js App Router API routes with Server-Sent Events (SSE) for real-time crawl progress updates. The client receives each crawled URL as it's processed.

## Key Insights

1. Next.js Route Handlers support `ReadableStream` natively
2. SSE is unidirectional (server → client) — perfect for crawlers
3. `export const dynamic = 'force-dynamic'` prevents caching
4. Generator pattern yields results as they're crawled
5. Client uses `fetch` + `ReadableStream` reader (no EventSource needed for POST)
6. SSE `page` events MUST include `pagesDiscovered` for live progress bar
7. Pass `AbortSignal` to crawler generator for proper cancellation

## Requirements

### Functional Requirements
- POST `/api/crawl` — Start crawl, stream results via SSE
- GET `/api/crawl/[id]/status` — Query crawl status
- POST `/api/crawl/[id]/stop` — Stop active crawl
- GET `/api/crawl/[id]/results` — Get completed results

### Non-Functional Requirements
- Each file under 200 lines
- In-memory crawl session management
- Proper SSE headers (`text/event-stream`)

## Architecture

### Data Flow

```
Client POST /api/crawl
  ↓
Create crawl session (generate ID)
  ↓
Start BFS crawler (async)
  ↓
Stream results via SSE:
  data: {"type":"page","data":{...}}
  data: {"type":"done","total":123}
```

### Module Structure

```
app/
└── api/
    └── crawl/
        ├── route.ts           # POST: Start crawl (SSE)
        ├── [id]/
        │   ├── route.ts       # GET: Status
        │   ├── stop/
        │   │   └── route.ts   # POST: Stop crawl
        │   └── results/
        │       └── route.ts   # GET: Results
store/
└── crawl-session.ts           # In-memory session store
```

## Related Code Files

### Files to Create
- `app/api/crawl/route.ts`
- `app/api/crawl/[id]/route.ts`
- `app/api/crawl/[id]/stop/route.ts`
- `app/api/crawl/[id]/results/route.ts`
- `store/crawl-session.ts`

### Files to Modify
- `crawler/bfs.ts` — Integrate with session store
- `lib/types.ts` — Add session types

## Implementation Steps

1. **Create session store** — `store/crawl-session.ts`:
   ```ts
   import { randomUUID } from 'node:crypto';
   import type { CrawlResult } from '@/lib/types';

   export interface CrawlSession {
     id: string;
     status: 'idle' | 'running' | 'completed' | 'stopped' | 'error';
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
     abortController: AbortController | null;
   }

   const sessions = new Map<string, CrawlSession>();

   export function createSession(config: CrawlSession['config'], seedUrl: string): CrawlSession {
     const session: CrawlSession = {
       id: randomUUID(),
       status: 'idle',
       seedUrl,
       config,
       results: [],
       stats: {
         pagesCrawled: 0,
         pagesDiscovered: 1, // Seed URL
         pagesFailed: 0,
         currentDepth: 0,
       },
       startedAt: null,
       completedAt: null,
       abortController: new AbortController(),
     };
     sessions.set(session.id, session);
     return session;
   }

   export function getSession(id: string): CrawlSession | undefined {
     return sessions.get(id);
   }

   export function updateSession(id: string, update: Partial<CrawlSession>): void {
     const session = sessions.get(id);
     if (session) {
       Object.assign(session, update);
     }
   }

   export function deleteSession(id: string): void {
     sessions.delete(id);
   }

   export function getAllSessions(): CrawlSession[] {
     return Array.from(sessions.values());
   }
   ```

2. **Create crawl API route** — `app/api/crawl/route.ts`:
   ```ts
   import { NextRequest } from 'next/server';
   import { crawlGenerator, createConfig } from '@/crawler/bfs';
   import { createSession, updateSession } from '@/store/crawl-session';
   import { crawlRequestSchema } from '@/lib/schemas';
   import { isIndexable } from '@/crawler/parser';
   import type { CrawlResult } from '@/lib/types';

   export const dynamic = 'force-dynamic';

   export async function POST(req: NextRequest) {
     const body = await req.json();
     const parsed = crawlRequestSchema.safeParse(body);

     if (!parsed.success) {
       return Response.json({ error: parsed.error }, { status: 400 });
     }

     const { url, maxDepth, maxPages, useJs } = parsed.data;

     // Create session
     const session = createSession(
       { maxDepth, maxPages, useJs, respectRobotsTxt: true },
       url
     );

     const encoder = new TextEncoder();

     const stream = new ReadableStream({
       async start(controller) {
         updateSession(session.id, {
           status: 'running',
           startedAt: new Date(),
         });

         try {
           const config = createConfig({
             seedUrl: url,
             maxDepth,
             maxPages,
             useJs,
             respectRobotsTxt: true,
           });

           const inlinksMap = new Map<string, number>();

           for await (const parsed of crawlGenerator(config)) {
             // Check for abort
             if (session.abortController?.signal.aborted) {
               controller.close();
               return;
             }

             // Track inlinks
             for (const link of parsed.internalLinks) {
               inlinksMap.set(link, (inlinksMap.get(link) || 0) + 1);
             }

             const result: CrawlResult = {
               url: parsed.url,
               status: parsed.status,
               contentType: parsed.contentType,
               depth: parsed.depth,
               title: parsed.title,
               canonical: parsed.canonical,
               metaRobots: parsed.metaRobots,
               esIndexable: isIndexable(parsed.metaRobots),
               inlinks: inlinksMap.get(parsed.url) || 0,
               discoveredFrom: null, // Track separately if needed
             };

             session.results.push(result);
             session.stats.pagesCrawled++;
             session.stats.currentDepth = Math.max(
               session.stats.currentDepth,
               parsed.depth
             );

             // Send event (includes discovered count for live progress bar)
             controller.enqueue(
               encoder.encode(
                 `data: ${JSON.stringify({
                   type: 'page',
                   data: result,
                   stats: {
                     crawled: session.stats.pagesCrawled,
                     discovered: session.stats.pagesDiscovered,
                   },
                 })}\n\n`
               )
             );
           }

           updateSession(session.id, {
             status: 'completed',
             completedAt: new Date(),
           });

           controller.enqueue(
             encoder.encode(
               `data: ${JSON.stringify({
                 type: 'done',
                 total: session.results.length,
               })}\n\n`
             )
           );
         } catch (error) {
           updateSession(session.id, {
             status: 'error',
             completedAt: new Date(),
           });

           controller.enqueue(
             encoder.encode(
               `data: ${JSON.stringify({
                 type: 'error',
                 error: error instanceof Error ? error.message : 'Unknown error',
               })}\n\n`
             )
           );
         } finally {
           controller.close();
         }
       },
     });

     return new Response(stream, {
       headers: {
         'Content-Type': 'text/event-stream',
         'Cache-Control': 'no-cache',
         Connection: 'keep-alive',
         'X-Accel-Buffering': 'no',
       },
     });
   }
   ```

3. **Create status API** — `app/api/crawl/[id]/route.ts`:
   ```ts
   import { NextRequest } from 'next/server';
   import { getSession } from '@/store/crawl-session';

   export const dynamic = 'force-dynamic';

   export async function GET(
     req: NextRequest,
     { params }: { params: Promise<{ id: string }> }
   ) {
     const { id } = await params;
     const session = getSession(id);

     if (!session) {
       return Response.json({ error: 'Session not found' }, { status: 404 });
     }

     return Response.json({
       id: session.id,
       status: session.status,
       stats: session.stats,
       startedAt: session.startedAt,
       completedAt: session.completedAt,
     });
   }
   ```

4. **Create stop API** — `app/api/crawl/[id]/stop/route.ts`:
   ```ts
   import { NextRequest } from 'next/server';
   import { getSession, updateSession } from '@/store/crawl-session';

   export const dynamic = 'force-dynamic';

   export async function POST(
     req: NextRequest,
     { params }: { params: Promise<{ id: string }> }
   ) {
     const { id } = await params;
     const session = getSession(id);

     if (!session) {
       return Response.json({ error: 'Session not found' }, { status: 404 });
     }

     if (session.status !== 'running') {
       return Response.json({ error: 'Crawl is not running' }, { status: 400 });
     }

     session.abortController?.abort();
     updateSession(id, { status: 'stopped', completedAt: new Date() });

     return Response.json({ success: true });
   }
   ```

5. **Create results API** — `app/api/crawl/[id]/results/route.ts`:
   ```ts
   import { NextRequest } from 'next/server';
   import { getSession } from '@/store/crawl-session';
   import type { CrawlResult } from '@/lib/types';

   export const dynamic = 'force-dynamic';

   export async function GET(
     req: NextRequest,
     { params }: { params: Promise<{ id: string }> }
   ) {
     const { id } = await params;
     const session = getSession(id);

     if (!session) {
       return Response.json({ error: 'Session not found' }, { status: 404 });
     }

     const { searchParams } = new URL(req.url);
     const page = parseInt(searchParams.get('page') || '1');
     const limit = parseInt(searchParams.get('limit') || '50');

     const start = (page - 1) * limit;
     const end = start + limit;
     const paginated = session.results.slice(start, end);

     return Response.json({
       data: paginated,
       total: session.results.length,
       page,
       limit,
       totalPages: Math.ceil(session.results.length / limit),
     });
   }
   ```

6. **Update lib/types.ts** — Add crawl result:
   ```ts
   export interface CrawlResult {
     url: string;
     status: number;
     contentType: string;
     depth: number;
     title: string | null;
     canonical: string | null;
     metaRobots: string | null;
     esIndexable: boolean;
     inlinks: number;
     discoveredFrom: string | null;
   }
   ```

## Success Criteria

- [ ] POST `/api/crawl` starts crawl and streams SSE
- [ ] Client receives page events in real-time
- [ ] Session is stored in memory
- [ ] GET `/api/crawl/[id]` returns status
- [ ] POST `/api/crawl/[id]/stop` aborts crawl
- [ ] GET `/api/crawl/[id]/results` returns paginated results
- [ ] All files under 200 lines

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE timeout on serverless | Low | Medium | Not using serverless |
| Memory leak from sessions | Medium | High | Session cleanup on complete |
| Concurrent crawl issues | Low | Low | One crawl per session design |

## Rollback Plan

If SSE has issues:
1. Fall back to polling-based progress
2. Use `/api/crawl/[id]/status` endpoint

## Dependencies

- **Blocked by:** Phase 2 (BFS crawler core)
- **Blocks:** Phase 4 (UI crawl form)
- **External:** None

## Next Steps

1. Merge `feature/api-streaming` → `develop`
2. Tag `v0.4.0` on merge
3. Create `feature/ui-crawl-form` branch
4. Begin Phase 5
