---
title: "ScreamingWeb — SEO Crawler Implementation Plan"
description: "Full-stack SEO crawler with Next.js, Playwright, Cheerio, Docker"
status: pending
priority: P1
effort: 40h
branch: develop
tags: [nextjs, playwright, crawler, docker, seo]
created: 2026-04-04
---

# ScreamingWeb Implementation Plan

## Overview

Build a browser-based SEO crawler (mini Screaming Frog) using Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Cheerio + Playwright, and Docker deployment.

**Tech Stack:**
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui components
- Cheerio (primary) + Playwright Chromium (fallback for JS pages)
- Zod validation, in-memory state (no database)
- Docker + docker-compose, Dokploy deployment

## Validation Decisions (2026-04-04)

- **Data fetching:** TanStack React Query (no-use-effect Rule 2)
- **Results flow:** Hybrid — SSE to client + server-side store for export
- **Phase order:** Reordered — API + Cheerio first, Playwright later
- **Concurrency:** Sequential only (future enhancement)

## Phases & Semver

| Phase | Version | Status | Description | Branch |
|-------|---------|--------|-------------|--------|
| [Phase 1](./phase-01-project-scaffolding.md) | v0.1.0 | pending | Project scaffolding, Git setup, CI, React Query | `feature/scaffolding` |
| [Phase 2](./phase-02-bfs-crawler-core.md) | v0.2.0 | pending | BFS crawler core (queue, visited, fetcher, parser) | `feature/bfs-crawler` |
| [Phase 3](./phase-03-api-streaming.md) | v0.3.0 | pending | API routes + SSE streaming (Cheerio-only) | `feature/api-streaming` |
| [Phase 4](./phase-04-ui-crawl-form.md) | v0.4.0 | pending | UI — Crawl form + progress bar + results table | `feature/ui-crawl-form` |
| [Phase 5](./phase-05-hybrid-fetch-robots.md) | v0.5.0 | pending | Hybrid fetch (Playwright fallback) + robots.txt | `feature/hybrid-fetch` |
| [Phase 6](./phase-06-ui-results-table.md) | v0.6.0 | pending | UI — Results table + export (CSV/JSON) | `feature/ui-results-table` |
| [Phase 7](./phase-07-export-store.md) | v0.7.0 | pending | Export (CSV/JSON) + in-memory store cleanup | `feature/export-store` |
| [Phase 8](./phase-08-docker-dokploy.md) | v0.8.0 | pending | Docker + docker-compose + Dokploy config | `feature/docker-dokploy` |
| [Phase 9](./phase-09-testing-polish.md) | v0.9.0 | pending | Testing + polish + README | `feature/testing-polish` |
| Release | v1.0.0 | pending | First production release | `main` |

> **Note:** Phases reordered from original. API (Phase 3) now comes before Playwright (Phase 5) to enable full-stack testing earlier. See [validation-report.md](./validation-report.md) for details.

## Branching Strategy

```
main           ───────────────────────────────────────────── release/v1.0.0
                 │
develop         ◄─────────────────────────────────────────────┘
                 │
  ┌──────────────┼──────────────┬──────────────┬──────────────┐
  │              │              │              │              │
feature/*   feature/bfs-   feature/hybrid-  feature/api-   feature/ui-
scaffolding  crawler      fetch         streaming     crawl-form
  │              │              │              │              │
  ▼              ▼              ▼              ▼              ▼
v0.1.0         v0.2.0         v0.3.0         v0.4.0         v0.5.0
```

**Rules:**
1. `develop` = integration branch, always merge to `develop` first
2. Each phase gets its own `feature/{phase-name}` branch
3. Merge `feature/*` → `develop` via pull request
4. `main` = releases only, merge from `develop` with tags
5. Tags: `v{major}.{minor}.{patch}` at milestones

## GitHub Actions

- `.github/workflows/ci.yml` — build, lint, test on push
- `.github/workflows/docker.yml` — build & push Docker image
- `.github/workflows/deploy.yml` — deploy to Dokploy on release

## Success Criteria

- User enters URL, system crawls and discovers HTML URLs
- BFS traversal with configurable depth/page limits
- Hybrid fetch (Cheerio primary, Playwright fallback)
- Real-time progress via SSE
- Sortable/filterable results table
- CSV/JSON export
- Docker deployment ready

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Playwright memory leaks in Docker | High | Browser singleton, page cleanup, health checks |
| SSE timeout on Vercel | Medium | Self-hosted only (Dokploy), not serverless |
| Large crawl memory exhaustion | Medium | Configurable `maxPages` cap (default 500) |
| Chromium startup delays | Low | Reuse browser instance, warm pool |

## Next Steps

1. Review and approve Phase 1
2. Create `feature/scaffolding` branch
3. Begin implementation
