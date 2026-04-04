---
title: "Phase 8: Docker & Dokploy Deployment"
description: "Create Dockerfile, docker-compose.yml, and Dokploy configuration"
status: pending
priority: P1
effort: 4h
branch: feature/docker-dokploy
version: v0.8.0
tags: [docker, playwright, dokploy, deployment]
created: 2026-04-04
---

# Phase 8: Docker & Dokploy Deployment

## Context

**Related Reports:**
- `researcher-docker-playwright-report.md` — Sections 1-5 (Dockerfile, docker-compose, Dokploy)

**Overview:**
Create production-ready Docker configuration with multi-stage build, Playwright Chromium setup, and Dokploy deployment configuration.

## Key Insights

1. Use `node:20-bookworm-slim` (NOT Alpine — Playwright requires glibc)
2. Multi-stage build keeps final image lean
3. `output: 'standalone'` in next.config.js is critical
4. `ipc: host` and `init: true` required for Chromium in Docker
5. Memory limit 2GB minimum for Playwright

## Requirements

### Functional Requirements
- Multi-stage Dockerfile
- Chromium-only Playwright install
- docker-compose.yml for local testing
- .dockerignore for faster builds
- Dokploy deployment documentation

### Non-Functional Requirements
- Final image size ~800MB-1.2GB
- Container starts in <30s
- Health check endpoint

## Architecture

### Docker Stages

```
deps → playwright-setup → builder → runner
```

### Container Configuration

```
Exposed port: 3000
Memory limit: 2GB
Restart: unless-stopped
Health check: GET /api/health
```

## Related Code Files

### Files to Create
- `Dockerfile` (complete, replace stub)
- `docker-compose.yml` (complete, replace stub)
- `.dockerignore`
- `app/api/health/route.ts` (health check endpoint)
- `docs/deployment.md` (Dokploy instructions)

### Files to Modify
- `next.config.js` — Already has `output: 'standalone'`

## Implementation Steps

1. **Create health check API** — `app/api/health/route.ts`:
   ```ts
   import { NextResponse } from 'next/server';

   export const dynamic = 'force-dynamic';

   export async function GET() {
     // Check memory usage
     const memUsage = process.memoryUsage();
     const memMb = Math.round(memUsage.heapUsed / 1024 / 1024);

     // Return health status
     return NextResponse.json({
       status: 'ok',
       timestamp: new Date().toISOString(),
       memory: `${memMb}MB`,
     });
   }
   ```

2. **Create Dockerfile** — `Dockerfile`:
   ```dockerfile
   # ============================================
   # Stage 1: Dependencies
   # ============================================
   FROM node:20-bookworm-slim AS dependencies

   WORKDIR /app

   COPY package.json package-lock.json* ./

   RUN npm ci --no-audit --no-fund

   # ============================================
   # Stage 2: Install Playwright Chromium
   # ============================================
   FROM dependencies AS playwright-setup

   # Install only Chromium browser + system deps
   RUN npx playwright install --with-deps chromium

   # ============================================
   # Stage 3: Build Next.js
   # ============================================
   FROM dependencies AS builder

   COPY --from=playwright-setup /root/.cache/ms-playwright /root/.cache/ms-playwright

   COPY . .

   ENV NODE_ENV=production
   ENV NEXT_TELEMETRY_DISABLED=1

   RUN npm run build

   # ============================================
   # Stage 4: Production Runner
   # ============================================
   FROM node:20-bookworm-slim AS runner

   WORKDIR /app

   ENV NODE_ENV=production
   ENV PORT=3000
   ENV HOSTNAME="0.0.0.0"
   ENV NEXT_TELEMETRY_DISABLED=1
   # Hermetic Playwright: use browsers installed inside the image
   ENV PLAYWRIGHT_BROWSERS_PATH=0

   RUN groupadd --gid 1001 nodejs \
       && useradd --uid 1001 --gid nodejs --shell /bin/bash pwuser

   # Install only the runtime system deps Playwright needs
   RUN apt-get update && apt-get install -y --no-install-recommends \
       libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 \
       libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 \
       libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
       libcairo2 libasound2t64 libxshmfence1 \
       && rm -rf /var/lib/apt/lists/*

   # Copy standalone Next.js output
   COPY --from=builder --chown=pwuser:pwuser /app/public ./public
   COPY --from=builder --chown=pwuser:pwuser /app/.next/standalone ./
   COPY --from=builder --chown=pwuser:pwuser /app/.next/static ./.next/static

   # Copy Playwright browser binaries
   COPY --from=playwright-setup --chown=pwuser:pwuser /root/.cache/ms-playwright /home/pwuser/.cache/ms-playwright

   USER pwuser

   EXPOSE 3000

   CMD ["node", "server.js"]
   ```

3. **Create docker-compose.yml** — `docker-compose.yml`:
   ```yaml
   version: '3.8'

   services:
     screaming-web:
       build:
         context: .
         dockerfile: Dockerfile
       container_name: screaming-web
       ports:
         - "3000:3000"
       environment:
         - NODE_ENV=production
       restart: unless-stopped
       # CRITICAL for Playwright/Chromium stability in Docker
       init: true            # Prevents zombie processes (tini)
       ipc: host             # Prevents Chromium OOM crashes
       deploy:
         resources:
           limits:
             memory: 2G
           reservations:
             memory: 512M
       healthcheck:
         # Use node (not curl — bookworm-slim has no curl)
         test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
         interval: 30s
         timeout: 10s
         retries: 3
         start_period: 40s
   ```

4. **Create .dockerignore** — `.dockerignore`:
   ```
   node_modules
   .next
   .git
   .gitignore
   README.md
   .env*
   .dockerignore
   docker-compose*.yml
   Dockerfile
   plans/
   docs/
   *.md
   .vscode/
   ```

5. **Create deployment docs** — `docs/deployment.md`:
   ```markdown
   # Deployment with Dokploy

   ## Prerequisites
   - VPS with Ubuntu 22.04+ (2GB RAM minimum)
   - Domain name pointed to VPS

   ## Install Dokploy

   ```bash
   curl -sSL https://dokploy.com/install.sh | sh
   ```

   ## Deploy via Docker Compose

   1. Push code to GitHub
   2. In Dokploy dashboard: Applications → Docker Compose
   3. Select repository or upload `docker-compose.yml`
   4. Configure domain (Traefik handles SSL)
   5. Click Deploy

   ## Configuration

   - **Memory**: 2GB minimum
   - **Port**: 3000
   - **Health Check**: `/api/health`

   ## Local Testing

   ```bash
   docker-compose up --build
   ```

   Visit http://localhost:3000
   ```

6. **Update GitHub Actions** — `.github/workflows/docker.yml`:
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

         - name: Set up Docker Buildx
           uses: docker/setup-buildx-action@v3

         - name: Login to GHCR
           uses: docker/login-action@v3
           with:
             registry: ghcr.io
             username: ${{ github.actor }}
             password: ${{ secrets.GITHUB_TOKEN }}

         - name: Build and push
           uses: docker/build-push-action@v5
           with:
             context: .
             push: true
             tags: |
               ghcr.io/${{ github.repository }}:latest
               ghcr.io/${{ github.repository }}:${{ github.sha }}
             cache-from: type=gha
             cache-to: type=gha,mode=max
   ```

7. **Test local build**
   ```bash
   docker-compose up --build
   ```

8. **Verify image size**
   ```bash
   docker images | grep screaming-web
   # Should be ~800MB-1.2GB
   ```

## Success Criteria

- [ ] Docker image builds successfully
- [ ] Container runs on `localhost:3000`
- [ ] Playwright fetch works in container
- [ ] Health check returns 200
- [ ] Image size under 1.5GB
- [ ] Documentation complete

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Image too large | Medium | Low | Multi-stage build, chromium-only |
| Chromium crashes | Medium | High | `ipc: host`, `init: true` |
| Memory exhaustion | Medium | Medium | 2GB limit, health checks |
| Dokploy setup issues | Low | Low | Use standard Docker Compose |

## Rollback Plan

If Docker build fails:
1. Remove Playwright, use Cheerio-only
2. Switch to `node:20-alpine` without Playwright

## Dependencies

- **Blocked by:** Phase 7 (export)
- **Blocks:** Phase 9 (testing)
- **External:** Dokploy on VPS

## Next Steps

1. Merge `feature/docker-dokploy` → `develop`
2. Tag `v0.8.0` on merge
3. Create `feature/testing-polish` branch
4. Begin Phase 9
