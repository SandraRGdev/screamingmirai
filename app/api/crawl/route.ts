import { NextRequest } from "next/server";
import { crawlGenerator, createConfig, isIndexable } from "@/crawler";
import {
  createSession,
  updateSession,
} from "@/store/crawl-session";
import { crawlRequestSchema } from "@/lib/schemas";
import type { CrawlResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = crawlRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { url, maxDepth, maxPages, useJs, respectRobotsTxt } = parsed.data;

  // Create in-memory session with abort controller
  const session = createSession(
    { maxDepth, maxPages, useJs, respectRobotsTxt },
    url,
  );

  updateSession(session.id, {
    status: "running",
    startedAt: new Date(),
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send session ID as first event
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "session", id: session.id })}\n\n`,
        ),
      );

      try {
        const config = createConfig({
          seedUrl: url,
          maxDepth,
          maxPages,
          useJs,
          respectRobotsTxt,
          signal: session.abortController?.signal,
        });

        const inlinksMap = new Map<string, number>();
        const seenUrls = new Set<string>();

        for await (const page of crawlGenerator(config)) {
          // Check for abort
          if (session.abortController?.signal.aborted) {
            updateSession(session.id, {
              status: "stopped",
              completedAt: new Date(),
            });
            controller.close();
            return;
          }

          if (seenUrls.has(page.url)) {
            continue;
          }
          seenUrls.add(page.url);

          // Track inlinks from discovered internal links
          for (const link of page.internalLinks) {
            inlinksMap.set(link, (inlinksMap.get(link) || 0) + 1);
          }

          const result: CrawlResult = {
            url: page.url,
            status: page.status,
            contentType: page.contentType,
            depth: page.depth,
            title: page.title,
            canonical: page.canonical,
            metaRobots: page.metaRobots,
            lang: page.lang,
            hreflang: page.hreflang,
            esIndexable: isIndexable(page.metaRobots),
            inlinks: inlinksMap.get(page.url) || 0,
            discoveredFrom: null,
          };

          // Update session
          session.results.push(result);
          session.stats.pagesCrawled++;
          session.stats.pagesDiscovered = inlinksMap.size + 1;
          session.stats.currentDepth = Math.max(
            session.stats.currentDepth,
            page.depth,
          );

          // Send SSE page event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "page",
                data: result,
                stats: {
                  crawled: session.stats.pagesCrawled,
                  discovered: session.stats.pagesDiscovered,
                },
              })}\n\n`,
            ),
          );
        }

        updateSession(session.id, {
          status: "completed",
          completedAt: new Date(),
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              total: session.results.length,
            })}\n\n`,
          ),
        );
      } catch (error) {
        updateSession(session.id, {
          status: "error",
          completedAt: new Date(),
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error:
                error instanceof Error ? error.message : "Unknown error",
            })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },

    // Abort crawl when client disconnects
    cancel() {
      session.abortController?.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Session-Id": session.id,
    },
  });
}
