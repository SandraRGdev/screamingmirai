---
title: "Phase 1: Project Scaffolding & Git Setup"
description: "Initialize Next.js project with TypeScript, Tailwind, shadcn/ui, Git branching, CI base"
status: pending
priority: P1
effort: 4h
branch: feature/scaffolding
version: v0.1.0
tags: [nextjs, scaffolding, git, ci]
created: 2026-04-04
---

# Phase 1: Project Scaffolding & Git Setup

## Context

**Related Reports:**
- `researcher-screaming-web-full-report.md` — Section 13 (Quick Start Guide)
- `researcher-docker-playwright-report.md` — Section 1 (Dockerfile setup reference)

**Overview:**
Initialize the Next.js project with all required dependencies, configure Git branching strategy, set up GitHub Actions CI pipeline, and establish project structure.

## Key Insights

1. Use `create-next-app` with TypeScript, Tailwind, App Router, `src-dir=false` (keep root `/app`)
2. shadcn/ui requires manual initialization (not an npm package)
3. `output: 'standalone'` in `next.config.js` is critical for Docker
4. Early Git setup prevents rework later

## Requirements

### Functional Requirements
- Next.js 15+ with App Router
- TypeScript strict mode
- Tailwind CSS v4
- shadcn/ui components (table, button, input, card)
- ESLint + Prettier configured
- Git repository with branching strategy

### Non-Functional Requirements
- Project structure follows research report recommendations
- All files under 200 lines (modular)
- Git branches follow naming convention
- CI pipeline runs on every push

## Architecture

### Directory Structure

```
screaming-web/
├── .github/
│   └── workflows/
│       ├── ci.yml           # Lint, build, test
│       ├── docker.yml       # Docker image build
│       └── deploy.yml       # Deploy on release
├── .dockerignore
├── .gitignore
├── next.config.js           # output: 'standalone'
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── Dockerfile               # Multi-stage build
├── docker-compose.yml
├── .next/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/                 # Created in later phases
├── components/
│   └── ui/                  # shadcn components
├── lib/
│   ├── types.ts
│   └── schemas.ts
├── crawler/                 # Created in Phase 2
├── store/                   # Created in Phase 7
└── utils/                   # Created in Phase 7
```

## Related Code Files

### Files to Create
- `.github/workflows/ci.yml`
- `.github/workflows/docker.yml`
- `.github/workflows/deploy.yml`
- `.dockerignore`
- `Dockerfile` (Phase 8 details, but create stub)
- `docker-compose.yml` (Phase 8 details, but create stub)
- `lib/types.ts`
- `lib/schemas.ts`
- `components/ui/*` (shadcn)

### Files to Modify
- `next.config.js` — Add `output: 'standalone'`
- `tailwind.config.ts` — shadcn config
- `tsconfig.json` — Paths for `@/` alias
- `package.json` — Dependencies

## Implementation Steps

1. **Initialize Git repository**
   ```bash
   git init
   git checkout -b develop
   git checkout -b feature/scaffolding
   ```

2. **Create Next.js project**
   ```bash
   npx create-next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias="@/*"
   ```

3. **Install dependencies**
   ```bash
   npm install cheerio zod robots-parser @tanstack/react-query
   npm install -D prettier prettier-plugin-tailwindcss
   ```

4. **Initialize shadcn/ui**
   ```bash
   npx shadcn@latest init -d
   npx shadcn@latest add button input card table
   ```

5. **Configure Next.js** — Edit `next.config.js`:
   ```js
   /** @type {import('next').NextConfig} */
   const nextConfig = {
     output: 'standalone',
   };
   module.exports = nextConfig;
   ```

6. **Create TypeScript types** — `lib/types.ts` (single source of truth):
   ```ts
   /** Single source of truth for all shared types. Crawler-internal types live in crawler/types.ts */

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

   export interface CrawlSession {
     id: string;
     status: 'idle' | 'running' | 'completed' | 'stopped' | 'error';
     seedUrl: string;
     config: { maxDepth: number; maxPages: number; useJs: boolean; respectRobotsTxt: boolean };
     results: CrawlResult[];
     stats: { pagesCrawled: number; pagesDiscovered: number; pagesFailed: number; currentDepth: number };
     startedAt: Date | null;
     completedAt: Date | null;
   }

   export type CrawlStatus = CrawlSession['status'];
   ```

7. **Create Zod schemas** — `lib/schemas.ts`:
   ```ts
   import { z } from 'zod';

   export const crawlRequestSchema = z.object({
     url: z.string().url(),
     maxDepth: z.number().min(1).max(10).default(3),
     maxPages: z.number().min(1).max(5000).default(500),
     useJs: z.boolean().default(false),
   });

   export type CrawlRequest = z.infer<typeof crawlRequestSchema>;
   ```

8. **Create React Query provider** — `components/providers.tsx`:
   ```tsx
   'use client';

   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
   import { useState } from 'react';

   export function Providers({ children }: { children: React.ReactNode }) {
     const [queryClient] = useState(() => new QueryClient({
       defaultOptions: {
         queries: { staleTime: 60_000, refetchOnWindowFocus: false },
       },
     }));

     return (
       <QueryClientProvider client={queryClient}>
         {children}
       </QueryClientProvider>
     );
   }
   ```

9. **Update `app/layout.tsx`** — Wrap with Providers:
   ```tsx
   import { Providers } from '@/components/providers';

   export default function RootLayout({ children }) {
     return (
       <html lang="en">
         <body>
           <Providers>{children}</Providers>
         </body>
       </html>
     );
   }
   ```

8. **Create GitHub Actions CI** — `.github/workflows/ci.yml`:
   ```yaml
   name: CI

   on: push

   jobs:
     lint:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: 'npm'
         - run: npm ci
         - run: npm run lint

     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: 'npm'
         - run: npm ci
         - run: npm run build
   ```

9. **Create Docker workflow** — `.github/workflows/docker.yml`:
   ```yaml
   name: Docker

   on:
     push:
       branches: [develop, main]
     workflow_dispatch:

   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: docker/setup-buildx-action@v3
         - uses: docker/login-action@v3
           with:
             registry: ghcr.io
             username: ${{ github.actor }}
             password: ${{ secrets.GITHUB_TOKEN }}
         - uses: docker/build-push-action@v5
           with:
             context: .
             push: true
             tags: ghcr.io/${{ github.repository }}:latest
             cache-from: type=gha
             cache-to: type=gha,mode=max
   ```

10. **Create stub Docker files** (detailed in Phase 8)
    - `Dockerfile` — Multi-stage placeholder
    - `docker-compose.yml` — Basic service definition
    - `.dockerignore` — Standard exclusions

11. **Configure Prettier** — `.prettierrc`:
    ```json
    {
      "semi": true,
      "singleQuote": true,
      "tabWidth": 2,
      "plugins": ["prettier-plugin-tailwindcss"]
    }
    ```

12. **Update `.gitignore`** — Add:
    ```
    .env.local
    .env.*.local
    playwright-report/
    test-results/
    *.log
    ```

13. **Commit and push**
    ```bash
    git add .
    git commit -m "feat: initialize Next.js project with shadcn/ui and CI"
    git push -u origin feature/scaffolding
    ```

14. **Create PR** — `feature/scaffolding` → `develop`

## Success Criteria

- [ ] Next.js app runs on `localhost:3000`
- [ ] shadcn/ui components render correctly
- [ ] TypeScript compiles without errors
- [ ] CI workflow passes on push
- [ ] Project structure matches spec
- [ ] All files under 200 lines

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| shadcn init fails | Low | Medium | Use manual component setup |
| CI workflow errors | Medium | Low | Test in GitHub Actions |
| Path alias issues | Low | Medium | Verify `@/` works early |

## Security Considerations

- No API keys in repository
- `.env.local` in `.gitignore`
- GITHUB_TOKEN has minimal scope

## Rollback Plan

If shadcn or CI setup fails:
1. Delete `.github/workflows/` and recreate from templates
2. Remove shadcn components, reinstall via CLI
3. Reset `node_modules` with `rm -rf && npm ci`

## Dependencies

- **Blocked by:** None
- **Blocks:** Phase 2 (BFS Crawler Core)
- **External:** None

## Next Steps

1. Merge `feature/scaffolding` → `develop`
2. Tag `v0.1.0` on merge
3. Create `feature/bfs-crawler` branch
4. Begin Phase 2
