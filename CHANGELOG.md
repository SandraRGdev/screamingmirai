# Changelog

## [1.0.0] - 2026-04-05

### Added

- BFS crawler with queue, visited set, and URL normalization
- Hybrid fetch: Cheerio (fast) + Playwright Chromium (JS fallback)
- robots.txt parsing and crawl-delay respect
- Server-Sent Events (SSE) for real-time crawl progress
- In-memory session store with 1-hour TTL auto-cleanup
- Crawl form with URL input, depth slider, page limit, JS toggle
- Real-time progress bar with crawled/discovered counters
- Post-crawl summary with indexable/non-indexable/error counts
- Sortable, filterable, paginated results table (TanStack Table v8)
- CSV export with UTF-8 BOM for Excel compatibility
- JSON export with metadata (timestamp, total count)
- Health check endpoint for Docker monitoring
- Multi-stage Dockerfile with Playwright Chromium support
- docker-compose.yml with healthcheck, memory limits, init/ipc
- GitHub Actions CI (lint, type-check, build)
- GitHub Actions Docker workflow (build & push to GHCR)
- Vitest unit tests for crawler, parser, and export (69 tests)
- Dokploy deployment support
