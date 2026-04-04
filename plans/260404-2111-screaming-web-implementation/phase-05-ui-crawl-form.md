---
title: "Phase 5: UI — Crawl Form & Progress"
description: "Build the crawl input form, progress bar, and real-time status display"
status: pending
priority: P1
effort: 4h
branch: feature/ui-crawl-form
version: v0.5.0
tags: [nextjs, ui, react, sse-client]
created: 2026-04-04
---

# Phase 5: UI — Crawl Form & Progress

## Context

**Related Reports:**
- `researcher-screaming-web-full-report.md` — Section 2 (TanStack Table setup reference)
- `researcher-shadcn-table-sse-report.md` — Section 3 (Client-side SSE consumption)

**Overview:**
Create the main page UI with URL input form, crawl options (depth, page limit, JS toggle), and real-time progress bar that updates via SSE.

## Key Insights

1. Server components for initial render, client components for interactivity
2. `useReducer` manages crawl state (idle → crawling → completed)
3. `fetch` + `ReadableStream` reader consumes SSE
4. shadcn/ui components for consistent styling
5. Progress bar calculates from `pagesCrawled / pagesDiscovered`

## Requirements

### Functional Requirements
- URL input field with validation
- Max depth slider (1-10)
- Max pages input (1-5000)
- "Use JavaScript rendering" toggle
- Start/Stop buttons
- Real-time progress bar
- URL counter (crawled/discovered)

### Non-Functional Requirements
- Each file under 200 lines
- Accessible form labels
- Loading states

## Architecture

### Data Flow

```
User enters URL + options
  ↓
Click "Start Crawl"
  ↓
POST /api/crawl with SSE reader
  ↓
For each SSE event:
  - Update progress bar
  - Increment URL counter
  - Store results in local state
  ↓
On "done" event: Show completion summary
```

### Component Structure

```
components/
├── crawl-form.tsx        # "use client" — URL input + options
├── crawl-progress.tsx    # "use client" — Progress bar + stats
└── crawl-summary.tsx     # "use client" — Completion summary
app/
└── page.tsx              # Server component — Main page
```

## Related Code Files

### Files to Create
- `components/crawl-form.tsx`
- `components/crawl-progress.tsx`
- `components/crawl-summary.tsx`
- `hooks/use-crawl-stream.ts` (SSE consumer hook)

### Files to Modify
- `app/page.tsx` — Main page layout
- `components/ui/` — May need additional shadcn components

## Implementation Steps

1. **Add missing shadcn components**
   ```bash
   npx shadcn@latest add slider switch label badge progress
   ```

2. **Create SSE hook** — `hooks/use-crawl-stream.ts`:
   ```ts
   'use client';

   import { useState, useCallback, useRef } from 'react';
   import type { CrawlResult } from '@/lib/types';

   type StreamEvent =
     | { type: 'page'; data: CrawlResult }
     | { type: 'done'; total: number }
     | { type: 'error'; error: string };

   export interface CrawlStreamState {
     status: 'idle' | 'connecting' | 'crawling' | 'completed' | 'error';
     results: CrawlResult[];
     stats: {
       crawled: number;
       total: number;
     };
     error: string | null;
   }

   export function useCrawlStream() {
     const [state, setState] = useState<CrawlStreamState>({
       status: 'idle',
       results: [],
       stats: { crawled: 0, total: 0 },
       error: null,
     });

     const abortControllerRef = useRef<AbortController | null>(null);

     const startCrawl = useCallback(async (options: {
       url: string;
       maxDepth: number;
       maxPages: number;
       useJs: boolean;
     }) => {
       abortControllerRef.current?.abort();
       abortControllerRef.current = new AbortController();

       setState({
         status: 'connecting',
         results: [],
         stats: { crawled: 0, total: 0 },
         error: null,
       });

       try {
         const response = await fetch('/api/crawl', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(options),
           signal: abortControllerRef.current.signal,
         });

         if (!response.ok) {
           throw new Error('Failed to start crawl');
         }

         setState((prev) => ({ ...prev, status: 'crawling' }));

         const reader = response.body?.getReader();
         const decoder = new TextDecoder();

         if (!reader) throw new Error('No response body');

         while (true) {
           const { done, value } = await reader.read();
           if (done) break;

           const text = decoder.decode(value);
           const lines = text.split('\n').filter((l) => l.startsWith('data: '));

           for (const line of lines) {
             try {
               const event: StreamEvent = JSON.parse(line.slice(6));

               if (event.type === 'page') {
                 setState((prev) => ({
                   ...prev,
                   results: [...prev.results, event.data],
                   stats: {
                     crawled: prev.results.length + 1,
                     total: prev.stats.total,
                   },
                 }));
               } else if (event.type === 'done') {
                 setState((prev) => ({
                   ...prev,
                   status: 'completed',
                   stats: { crawled: event.total, total: event.total },
                 }));
               } else if (event.type === 'error') {
                 setState((prev) => ({
                   ...prev,
                   status: 'error',
                   error: event.error,
                 }));
               }
             } catch {
               // Skip invalid JSON
             }
           }
         }
       } catch (err) {
         if (err instanceof Error && err.name !== 'AbortError') {
           setState((prev) => ({
             ...prev,
             status: 'error',
             error: err.message,
           }));
         }
       }
     }, []);

     const stopCrawl = useCallback(() => {
       abortControllerRef.current?.abort();
       setState((prev) => ({ ...prev, status: 'idle' }));
     }, []);

     const reset = useCallback(() => {
       setState({
         status: 'idle',
         results: [],
         stats: { crawled: 0, total: 0 },
         error: null,
       });
     }, []);

     return { state, startCrawl, stopCrawl, reset };
   }
   ```

3. **Create crawl form** — `components/crawl-form.tsx`:
   ```ts
   'use client';

   import { useState } from 'react';
   import { Button } from '@/components/ui/button';
   import { Input } from '@/components/ui/input';
   import { Label } from '@/components/ui/label';
   import { Slider } from '@/components/ui/slider';
   import { Switch } from '@/components/ui/switch';

   export interface CrawlOptions {
     url: string;
     maxDepth: number;
     maxPages: number;
     useJs: boolean;
   }

   export function CrawlForm({
     onSubmit,
     disabled,
   }: {
     onSubmit: (options: CrawlOptions) => void;
     disabled?: boolean;
   }) {
     const [url, setUrl] = useState('');
     const [maxDepth, setMaxDepth] = useState(3);
     const [maxPages, setMaxPages] = useState(500);
     const [useJs, setUseJs] = useState(false);

     const handleSubmit = (e: React.FormEvent) => {
       e.preventDefault();
       if (url) {
         onSubmit({ url, maxDepth, maxPages, useJs });
       }
     };

     return (
       <form onSubmit={handleSubmit} className="space-y-6">
         <div>
           <Label htmlFor="url">Starting URL</Label>
           <Input
             id="url"
             type="url"
             placeholder="https://example.com"
             value={url}
             onChange={(e) => setUrl(e.target.value)}
             disabled={disabled}
             required
           />
         </div>

         <div>
           <Label htmlFor="depth">Max Depth: {maxDepth}</Label>
           <Slider
             id="depth"
             min={1}
             max={10}
             step={1}
             value={[maxDepth]}
             onValueChange={([v]) => setMaxDepth(v)}
             disabled={disabled}
           />
         </div>

         <div>
           <Label htmlFor="pages">Max Pages</Label>
           <Input
             id="pages"
             type="number"
             min={1}
             max={5000}
             value={maxPages}
             onChange={(e) => setMaxPages(parseInt(e.target.value) || 500)}
             disabled={disabled}
           />
         </div>

         <div className="flex items-center gap-2">
           <Switch
             id="js"
             checked={useJs}
             onCheckedChange={setUseJs}
             disabled={disabled}
           />
           <Label htmlFor="js">Use JavaScript rendering (slower)</Label>
         </div>

         <Button type="submit" disabled={disabled || !url} className="w-full">
           {disabled ? 'Crawling...' : 'Start Crawl'}
         </Button>
       </form>
     );
   }
   ```

4. **Create progress component** — `components/crawl-progress.tsx`:
   ```ts
   'use client';

   import { Progress } from '@/components/ui/progress';
   import { Badge } from '@/components/ui/badge';

   export function CrawlProgress({
     crawled,
     total,
     status,
   }: {
     crawled: number;
     total: number;
     status: 'connecting' | 'crawling' | 'completed' | 'error';
   }) {
     const progress = total > 0 ? (crawled / total) * 100 : 0;

     return (
       <div className="space-y-2">
         <div className="flex items-center justify-between">
           <span className="text-sm text-muted-foreground">
             {status === 'connecting' && 'Connecting...'}
             {status === 'crawling' && 'Crawling...'}
             {status === 'completed' && 'Completed'}
             {status === 'error' && 'Error'}
           </span>
           <span className="text-sm font-medium">
             {crawled} / {total}
           </span>
         </div>
         <Progress value={progress} />
         <div className="flex gap-2">
           <Badge variant="secondary">{crawled} crawled</Badge>
           <Badge variant="outline">{total} discovered</Badge>
         </div>
       </div>
     );
   }
   ```

5. **Create summary component** — `components/crawl-summary.tsx`:
   ```ts
   'use client';

   import { Card } from '@/components/ui/card';
   import type { CrawlResult } from '@/lib/types';

   export function CrawlSummary({ results }: { results: CrawlResult[] }) {
     const indexable = results.filter((r) => r.esIndexable).length;
     const nonIndexable = results.length - indexable;
     const errors = results.filter((r) => r.status >= 400).length;

     return (
       <Card className="p-6">
         <h3 className="text-lg font-semibold mb-4">Crawl Summary</h3>
         <div className="grid grid-cols-3 gap-4 text-center">
           <div>
             <div className="text-2xl font-bold">{results.length}</div>
             <div className="text-sm text-muted-foreground">Total URLs</div>
           </div>
           <div>
             <div className="text-2xl font-bold text-green-600">{indexable}</div>
             <div className="text-sm text-muted-foreground">Indexable</div>
           </div>
           <div>
             <div className="text-2xl font-bold text-red-600">{nonIndexable}</div>
             <div className="text-sm text-muted-foreground">Non-Indexable</div>
           </div>
         </div>
       </Card>
     );
   }
   ```

6. **Update main page** — `app/page.tsx`:
   ```ts
   'use client';

   import { CrawlForm } from '@/components/crawl-form';
   import { CrawlProgress } from '@/components/crawl-progress';
   import { CrawlSummary } from '@/components/crawl-summary';
   import { useCrawlStream } from '@/hooks/use-crawl-stream';
   import { Button } from '@/components/ui/button';

   export default function HomePage() {
     const { state, startCrawl, stopCrawl, reset } = useCrawlStream();

     return (
       <main className="container mx-auto py-10 max-w-4xl">
         <h1 className="text-3xl font-bold mb-8">ScreamingWeb SEO Crawler</h1>

         {state.status === 'idle' || state.status === 'error' ? (
           <>
             <CrawlForm
               onSubmit={startCrawl}
               disabled={state.status !== 'idle'}
             />
             {state.error && (
               <div className="mt-4 text-red-500">{state.error}</div>
             )}
           </>
         ) : (
           <>
             <CrawlProgress
               crawled={state.stats.crawled}
               total={state.stats.total}
               status={state.status}
             />
             <div className="mt-4 flex gap-2">
               <Button onClick={stopCrawl} variant="destructive">
                 Stop Crawl
               </Button>
               {state.status === 'completed' && (
                 <Button onClick={reset}>New Crawl</Button>
               )}
             </div>
           </>
         )}

         {state.status === 'completed' && (
           <div className="mt-8">
             <CrawlSummary results={state.results} />
           </div>
         )}
       </main>
     );
   }
   ```

## Success Criteria

- [ ] URL input validates URLs
- [ ] Start button triggers crawl
- [ ] Progress bar updates in real-time
- [ ] Stop button aborts crawl
- [ ] Summary shows after completion
- [ ] All files under 200 lines

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE connection drops | Medium | Medium | Auto-reconnect on error |
| State desync | Low | Low | Single source of truth (hook) |
| Large result memory | Medium | Medium | Paginated table in Phase 6 |

## Rollback Plan

If streaming UI has issues:
1. Show loading spinner instead of real-time progress
2. Poll `/api/crawl/[id]/status` for updates

## Dependencies

- **Blocked by:** Phase 4 (API routes)
- **Blocks:** Phase 6 (results table)
- **External:** None

## Next Steps

1. Merge `feature/ui-crawl-form` → `develop`
2. Tag `v0.5.0` on merge
3. Create `feature/ui-results-table` branch
4. Begin Phase 6
