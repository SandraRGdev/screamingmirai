# ScreamingWeb

A browser-based SEO crawler that discovers internal HTML URLs using BFS traversal. Think of it as a lightweight, self-hosted alternative to Screaming Frog.

## Features

- **BFS Crawl** — Discovers URLs breadth-first, mirroring how search engines explore sites
- **Hybrid Fetching** — Cheerio (fast) for static pages, Playwright Chromium (slow) for JS-rendered pages
- **Real-time Progress** — Server-Sent Events stream crawl results as they happen
- **Results Table** — Sortable, filterable, paginated table with TanStack Table
- **Export** — CSV (Excel-compatible with BOM) and JSON export of filtered or all results
- **robots.txt** — Respects robots.txt rules and crawl-delay
- **Docker Ready** — Multi-stage build with Chromium, deploy via docker-compose

## Quick Start

### With Docker

```bash
docker-compose up --build
```

Visit http://localhost:3000

### Local Development

```bash
npm install
npm run dev
```

## Usage

1. Enter a starting URL (e.g. `https://example.com`)
2. Configure max depth (1-10) and max pages (1-5000)
3. Toggle "Use JavaScript rendering" if the site uses client-side rendering
4. Click **Start Crawl**
5. Watch results appear in real-time
6. Filter by URL or title, sort columns, paginate
7. Export filtered results as CSV or JSON

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Table:** TanStack Table v8 with sorting, filtering, pagination
- **Crawler:** Cheerio (primary parser), Playwright Chromium (JS fallback)
- **Streaming:** Server-Sent Events (SSE) via ReadableStream
- **Validation:** Zod
- **Deployment:** Docker multi-stage build, docker-compose, Dokploy

## Project Structure

```
app/
├── api/crawl/          # SSE streaming crawl endpoint
├── api/health/         # Health check for Docker
├── page.tsx            # Main UI page
components/
├── crawl-form.tsx      # URL input + options
├── crawl-progress.tsx  # Real-time progress bar
├── crawl-summary.tsx   # Post-crawl statistics
├── crawl-results-table.tsx  # Results table wrapper
├── table/              # TanStack Table components
└── ui/                 # shadcn/ui primitives
crawler/
├── bfs.ts              # BFS crawler generator
├── parser.ts           # Cheerio HTML parser
├── fetcher.ts          # HTTP fetcher
├── hybrid-fetcher.ts   # Cheerio + Playwright fallback
├── playwright.ts       # Browser singleton
├── robots.ts           # robots.txt parser
└── url-utils.ts        # URL normalization & validation
hooks/
├── use-crawl-stream.ts # SSE consumer hook
└── use-export.ts       # CSV/JSON export hook
lib/
├── types.ts            # Shared TypeScript types
└── schemas.ts          # Zod validation schemas
store/
└── crawl-session.ts    # In-memory session store with TTL
utils/
└── export.ts           # CSV/JSON export utilities
```

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npm run test         # Run unit tests (Vitest)
npm run test:watch   # Run tests in watch mode
```

## Deployment

### Dokploy

1. Install Dokploy on your VPS: `curl -sSL https://dokploy.com/install.sh | sh`
2. In Dokploy dashboard: Applications → Docker Compose
3. Connect your GitHub repository
4. Configure domain (Traefik handles SSL)
5. Deploy

### Manual Docker

```bash
docker build -t screamingweb .
docker run -p 3000:3000 --init --ipc=host --memory=2g screamingweb
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| Max Depth | 3 | Maximum crawl depth from seed URL |
| Max Pages | 500 | Maximum number of pages to crawl |
| JavaScript Rendering | Off | Use Playwright for JS-heavy sites (slower) |

## License

MIT
