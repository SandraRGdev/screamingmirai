# Docker Deployment: Next.js + Playwright (Scraping Library)

**Date:** 2026-04-04
**Scope:** Production Docker deployment for Next.js app using Playwright as a headless scraping library (NOT test runner). Single-service VPS deployment via Dokploy.
**Sources:** Playwright official docs (playwright.dev), Next.js official Docker example (github.com/vercel/next.js), Dokploy GitHub repo + docs (docs.dokploy.com)

---

## 1. Optimal Dockerfile for Next.js + Playwright (Chromium Only)

### Recommended Multi-Stage Build

```dockerfile
# ---- Stage 1: Dependencies ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# Install Playwright chromium with system dependencies
# This must happen in deps so the browser binaries are available
RUN npx playwright install --with-deps chromium

# ---- Stage 2: Build ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next.config.js MUST have output: 'standalone'
RUN npm run build

# ---- Stage 3: Runner ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1
# Hermetic Playwright: use browsers installed inside the image
ENV PLAYWRIGHT_BROWSERS_PATH=0

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash pwuser

# Copy standalone Next.js output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Playwright browser binaries from deps stage
COPY --from=deps /root/.cache/ms-playwright /home/pwuser/.cache/ms-playwright

# Install only the runtime system deps Playwright needs
# (these are the subset of --with-deps that are runtime-only)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 \
    libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2t64 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

USER pwuser

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `node:20-bookworm-slim` not `node:20-alpine` | Playwright requires glibc. Alpine uses musl. **Alpine is NOT supported.** |
| `playwright install --with-deps chromium` | Installs ONLY chromium + its OS deps. Avoids ~1GB of firefox/webkit. |
| `output: 'standalone'` in next.config.js | Produces minimal server bundle. No full node_modules needed at runtime. |
| Non-root user `pwuser` | Chromium refuses to run as root with certain sandbox settings. Security best practice. |
| `PLAYWRIGHT_BROWSERS_PATH=0` | Hermetic install — tells Playwright to look alongside its package, not in global cache. Adjust if browsers are copied elsewhere. |
| Multi-stage | Keeps final image lean. Build artifacts, dev deps, and apt caches are discarded. |

### next.config.js Requirement

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}
module.exports = nextConfig
```

Without `output: 'standalone'`, the Dockerfile above will not work correctly.

---

## 2. Installing Playwright Browsers in Docker (Chromium Only)

### The One Command

```bash
npx playwright install --with-deps chromium
```

This single command:
1. Downloads the Chromium browser binary (~150-200MB)
2. Installs all required OS-level system dependencies (libnss3, libgbm, etc.)

### Flags Reference

| Flag | Effect |
|------|--------|
| `--with-deps` | Installs OS packages via apt-get (libnss3, libgbm, etc.) |
| `chromium` | Only chromium, not firefox/webkit. Saves ~800MB. |
| `--only-shell` | Headless shell only (no full browser UI). Smaller binary. Use with `--with-deps`. |

### Headless Shell Optimization

For production scraping where you never need headed mode:

```bash
npx playwright install --with-deps --only-shell chromium
```

This installs the headless shell variant which is smaller. However, verify your scraping code works with headless shell before committing — some advanced scenarios need full Chromium.

### Browser Cache Location

| OS | Path |
|----|------|
| Linux | `~/.cache/ms-playwright` |
| Custom | Set `PLAYWRIGHT_BROWSERS_PATH` env var |
| Hermetic | `PLAYWRIGHT_BROWSERS_PATH=0` (looks alongside playwright package) |

### Why NOT Alpine

Playwright browsers are built against glibc. Alpine uses musl libc. Even with compatibility shims, Chromium will segfault or fail to launch. This is a hard constraint from the Playwright team. Use Debian-based images only.

---

## 3. Docker Image Size Optimization

### Expected Image Sizes

| Configuration | Approximate Size |
|---------------|-----------------|
| Next.js standalone (no Playwright) | ~150-200MB |
| + Chromium full browser | ~400-500MB |
| + Chromium headless shell | ~350-400MB |
| Official Playwright image (`mcr.microsoft.com/playwright`) | ~2GB+ (all browsers) |

### Optimization Techniques

1. **Chromium only** (biggest win): `npx playwright install chromium` instead of bare `npx playwright install`. Saves ~800MB by skipping firefox + webkit.

2. **Headless shell only**: `--only-shell` flag. Further reduces chromium binary size.

3. **Multi-stage build**: Discards build tools, dev deps, npm caches. The runner stage only gets what it needs.

4. **`node:slim`** instead of `node:full`: The slim variant removes apt package caches and non-essential packages. Saves ~200MB.

5. **`--no-install-recommends`** for apt: Prevents installing suggested packages that Playwright doesn't need.

6. **Clean apt lists**: `rm -rf /var/lib/apt/lists/*` after install. Standard practice.

7. **`.dockerignore`** (critical):
```
node_modules
.next
.git
*.md
.env*
docker-compose*.yml
Dockerfile
plans/
docs/
```

8. **Layer caching**: Order Dockerfile instructions from least to most frequently changing. `package.json` copies before source code so deps layer is cached.

9. **Standalone output**: Next.js standalone mode means the runner doesn't need the full `node_modules`. Only the traced dependencies are copied.

### What NOT to Do

- Do NOT use `mcr.microsoft.com/playwright` as base image for a Next.js app. It includes all 3 browsers and is ~2GB.
- Do NOT install `@playwright/test`. You only need `playwright` (the library package).
- Do NOT copy `node_modules` to the runner stage. Use standalone output.

---

## 4. docker-compose.yml for Single-Service Deployment

```yaml
version: "3.8"

services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      # Add your app env vars here
      # - DATABASE_URL=postgresql://...
      # - REDIS_URL=redis://...
    # CRITICAL for Playwright/Chromium stability in Docker
    init: true            # Prevents zombie processes (tini)
    ipc: host             # Prevents Chromium OOM crashes
    # Security: uncomment for scraping untrusted sites
    # cap_add:
    #   - SYS_ADMIN
    # seccomp: unconfined  # Alternative: use custom seccomp profile
    # Security hardening for production scraping:
    security_opt:
      - seccomp=seccomp-profile.json
    deploy:
      resources:
        limits:
          memory: 2G      # Chromium is memory-hungry
          cpus: "2.0"
        reservations:
          memory: 512M
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Seccomp Profile (`seccomp-profile.json`)

Required when running as non-root and scraping untrusted websites. Create this file in your project root:

```json
[
  {
    "comment": "Allow create user namespaces — needed by Chromium sandbox",
    "names": ["clone", "setns", "unshare"],
    "action": "SCMP_ACT_ALLOW",
    "args": [],
    "includes": {},
    "excludes": {}
  }
]
```

**Note:** This is a minimal profile. For a full security profile, extend from Docker's default seccomp and add the namespace syscalls above.

### Critical Docker Flags Explained

| Flag | Why Required |
|------|-------------|
| `init: true` | Chromium spawns subprocesses. Without init, zombie processes accumulate and eventually exhaust PIDs. |
| `ipc: host` | Chromium uses shared memory for rendering. Default Docker IPC (64MB) causes OOM crashes. Host IPC removes this limit. |
| `cap_add: SYS_ADMIN` | Needed for Chromium sandbox. Without it, must launch with `--no-sandbox` which is less secure. |
| Memory limit 2G | Chromium tabs consume 100-300MB each. With OS + Node + Next.js, 2G is the safe minimum for concurrent scraping. |

### When to Use `--no-sandbox`

If you cannot use `SYS_ADMIN` capability or seccomp profiles, launch Chromium with:

```typescript
const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

This is less secure but required in some restricted Docker environments. For Dokploy on your own VPS, `SYS_ADMIN` + seccomp is preferred.

---

## 5. Deployment with Dokploy (VPS)

### What Dokploy Is

Dokploy is an open-source PaaS (32k+ GitHub stars) — self-hosted alternative to Vercel/Heroku. Uses Docker + Traefik under the hood. Deploy any app to your VPS via GitHub push, Docker image, or Docker Compose.

### Installation on VPS

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

This installs Dokploy, Docker, Traefik, and sets up the management UI.

### Deployment Methods for This Project

**Option A: GitHub Integration (Recommended)**

1. Push project to GitHub
2. In Dokploy dashboard: Create Application > GitHub > Select repo
3. Dokploy auto-detects the Dockerfile and builds
4. Configure environment variables in Dokploy's "Environment" tab
5. Configure domain in Dokploy's "Domains" tab (Traefik handles SSL via Let's Encrypt)

**Option B: Docker Compose**

1. In Dokploy dashboard: Create Application > Docker Compose
2. Upload or link your `docker-compose.yml`
3. Dokploy manages the lifecycle via Docker Compose

**Option C: Docker Image (Pre-built)**

1. Build and push image to Docker Hub or GitHub Container Registry
2. In Dokploy: Create Application > Docker > Reference your image

### Dokploy Configuration for Playwright

In the Dokploy "Advanced" tab for your application:

| Setting | Value |
|---------|-------|
| Memory limit | 2GB minimum |
| CPU limit | 2 cores |
| Volumes | None needed for stateless Next.js |
| Ports | 3000 (auto-mapped by Traefik) |
| Run Command | Leave default (`node server.js`) |

### Important Dokploy Considerations

1. **Dockerfile detection**: Dokploy looks for a `Dockerfile` in the repo root. Place it there.
2. **Build context**: Dokploy builds on the VPS. Ensure VPS has enough disk space (~3GB for build).
3. **Environment variables**: Set in Dokploy UI, NOT in `.env` files. Dokploy injects them at runtime.
4. **Auto-deploy**: Configure webhook in Dokploy to auto-deploy on GitHub push.
5. **Logs**: Viewable in Dokploy dashboard. Essential for debugging Playwright crashes.
6. **Monitoring**: Dokploy shows CPU/memory graphs per container. Watch for memory leaks from Playwright.
7. **Traefik SSL**: Dokploy auto-configures HTTPS via Traefik + Let's Encrypt. No manual Nginx/Caddy needed.

### Dokploy Limitations

- Single-node by default (Docker Compose). Multi-node requires Docker Swarm setup.
- No built-in CDN. Consider Cloudflare in front for static assets.
- No serverless. Your container runs 24/7. Consider this for cost planning.

---

## 6. Memory and Performance Considerations

### Memory Usage Breakdown

| Component | Memory |
|-----------|--------|
| Node.js runtime | ~50-80MB |
| Next.js server | ~80-150MB |
| Chromium process (idle) | ~100-150MB |
| Chromium per active page | ~50-150MB per tab |
| OS overhead | ~50-100MB |

**Safe minimum:** 1GB for light scraping (1-2 concurrent pages)
**Recommended:** 2GB for moderate scraping (3-5 concurrent pages)
**Heavy use:** 4GB+ for high concurrency (5+ pages)

### Memory Management Best Practices

1. **Always close pages and browsers**:
```typescript
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.goto(url);
  // ... scrape ...
} finally {
  await page.close();
  await browser.close();  // Or reuse browser, close only pages
}
```

2. **Reuse browser, close pages**. Launching a browser is expensive (~2s, ~150MB). Keep one browser instance and open/close pages:

```typescript
// Singleton pattern — launch once, reuse
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--disable-gpu', '--disable-dev-shm-usage']
    });
  }
  return browserInstance;
}
```

3. **Use `--disable-dev-shm-usage`** when `ipc: host` is not available. Forces Chromium to use /tmp instead of shared memory.

4. **Set page timeouts** to prevent hung pages from leaking memory:
```typescript
await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
```

5. **Limit concurrency**. Each page is a separate Chromium process. Use a semaphore/queue:
```typescript
// Simple concurrency limiter
const MAX_CONCURRENT = 3;
const semaphore = new Semaphore(MAX_CONCURRENT);
```

6. **Monitor and restart**. Chromium has known memory leak tendencies in long-running processes. Implement a health check that restarts the container when memory exceeds a threshold.

### Performance Tips

| Technique | Impact |
|-----------|--------|
| Block images/CSS | 50-70% faster page loads. `await page.route('**/*.{png,jpg,css}', route => route.abort())` |
| `waitUntil: 'domcontentloaded'` | Don't wait for full load if you only need initial DOM |
| Reuse browser instance | Saves ~2s per scrape on browser launch |
| Page pool | Pre-warm 2-3 pages for burst traffic |
| `--disable-gpu` | No GPU needed in server containers |
| Headless shell (`--only-shell`) | Smaller binary, slightly faster startup |

### Container Restart Strategy

```yaml
restart: unless-stopped
deploy:
  resources:
    limits:
      memory: 2G
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 30s
  retries: 3
```

Configure a `/api/health` endpoint that checks memory usage and returns 503 if over threshold. Docker will restart the container.

---

## 7. Cheerio + Playwright Hybrid Fetching Pattern

### Architecture

```
Request URL
    |
    v
[Attempt fetch() + Cheerio parse]
    |
    +-- Success? --> Return parsed data (fast, cheap)
    |
    +-- Fail / Empty DOM? --> [Launch Playwright]
                                    |
                                    v
                              [Wait for JS render]
                                    |
                                    v
                              [Extract HTML]
                                    |
                                    v
                              [Parse with Cheerio]
                                    |
                                    v
                              Return parsed data (slow, expensive)
```

### Implementation Pattern

```typescript
import * as cheerio from 'cheerio';
import { chromium, type Browser } from 'playwright';

// ---------- Types ----------
interface ScrapedResult {
  html: string;
  usedPlaywright: boolean;
}

// ---------- Browser Singleton ----------
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-sandbox',        // Remove if using SYS_ADMIN capability
      ],
    });
  }
  return browser;
}

// ---------- Fast Path: fetch + Cheerio ----------
async function fetchWithCheerio(url: string): Promise<ScrapedResult | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),  // 10s timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ScreamingWeb/1.0)',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Heuristic: check if page has meaningful content
    // Adjust these checks based on what "empty" looks like for your targets
    const bodyText = $('body').text().trim();
    const hasContent = bodyText.length > 100;
    const hasReactRoot = $('#root').children().length === 0;
    const hasNextRoot = $('#__next').children().length === 0;

    // If page looks empty (JS not rendered), fall through to Playwright
    if (!hasContent || hasReactRoot || hasNextRoot) {
      return null;  // Signal to use Playwright
    }

    return { html, usedPlaywright: false };
  } catch {
    return null;  // Network error, timeout, etc. — try Playwright
  }
}

// ---------- Slow Path: Playwright ----------
async function fetchWithPlaywright(url: string): Promise<ScrapedResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Block unnecessary resources for speed
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2}', route => route.abort());

    await page.goto(url, {
      timeout: 30000,
      waitUntil: 'networkidle',  // Wait for JS to finish loading
    });

    const html = await page.content();
    return { html, usedPlaywright: true };
  } finally {
    await page.close();
  }
}

// ---------- Unified Fetcher ----------
export async function scrapeUrl(url: string): Promise<ScrapedResult> {
  // Try fast path first
  const fastResult = await fetchWithCheerio(url);
  if (fastResult) return fastResult;

  // Fall back to Playwright for JS-heavy pages
  return fetchWithPlaywright(url);
}
```

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| fetch() first, Playwright fallback | fetch uses ~0 extra memory. Playwright spawns a Chromium process. Use the cheap path when possible. |
| Cheerio for both paths | Same parsing logic regardless of fetch method. Only the HTML source differs. |
| Browser singleton | Avoid ~2s startup per request. One browser, multiple pages. |
| Block images/fonts in Playwright | 50-70% faster loads. We only need HTML, not assets. |
| `networkidle` wait strategy | Ensures JS has finished rendering. Use `domcontentloaded` if you know the target renders early. |
| Heuristic content check | Detects JS-dependent pages without needing a per-site allowlist. |

### Tuning the Heuristic

The "is this page JS-rendered?" check is the critical tuning point. Options:

1. **Body text length** — Simple. Empty body = JS-rendered. Fails on sites with minimal text.
2. **Check for common JS framework mount points** — `#root`, `#__next`, `#app` with empty children. Reliable for known frameworks.
3. **Check for `<script>` tags without corresponding content** — Indicates client-side rendering.
4. **Maintain a known-JS-sites list** — Explicit allowlist of domains that always need Playwright. Most reliable but requires maintenance.

**Recommendation:** Start with heuristic (body text + framework mount points). Add an explicit allowlist only if needed.

### Resource Cleanup

```typescript
// Call on graceful shutdown (SIGTERM, SIGINT)
process.on('SIGTERM', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
```

### Performance Comparison

| Method | Time | Memory | Use Case |
|--------|------|--------|----------|
| fetch + Cheerio | 100-500ms | ~5MB | Static HTML sites, APIs |
| Playwright + Cheerio | 2-8s | ~150-300MB | JS-heavy SPAs, React/Next sites |
| Hybrid (fetch-first) | 100ms-8s | 5-300MB | Unknown targets (automatic) |

---

## Trade-Off Matrix

| Dimension | fetch+Cheerio Only | Playwright Only | Hybrid (Recommended) |
|-----------|-------------------|-----------------|----------------------|
| Speed | Fast (100-500ms) | Slow (2-8s) | Fast for static, slow for JS |
| Memory | Minimal (~5MB) | High (~150-300MB) | Minimal when possible |
| Docker image size | ~150MB | ~400-500MB | ~400-500MB (Playwright included) |
| Accuracy on JS sites | Poor | Excellent | Excellent (automatic fallback) |
| Complexity | Low | Medium | Medium |
| Maintenance | Low | Medium | Medium (heuristic tuning) |

---

## Concrete Recommendation

**Use the Hybrid pattern with the multi-stage Dockerfile.**

1. The hybrid approach gives you best of both worlds — fast cheap scraping for static sites, reliable Playwright fallback for JS-heavy targets.
2. The multi-stage Dockerfile keeps the final image at ~400-500MB (vs 2GB+ with the official Playwright image).
3. Deploy via Dokploy with GitHub integration, 2GB memory limit, `init: true`, and `ipc: host`.
4. Start with heuristic content detection. Add a Playwright-only domain allowlist later if needed.

### Adoption Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Chromium crashes in Docker | Medium | `ipc: host`, `init: true`, memory limits, health checks |
| Memory leaks over time | Medium | Browser singleton with periodic restart, container health checks |
| Image size too large for VPS | Low | Multi-stage build + chromium-only = ~400MB |
| Dokploy incompatibility | Low | Standard Docker + Dockerfile, well-supported |
| Playwright version pinning | Low | Pin `playwright@1.58.2` in package.json |
| Alpine temptation | High | Document clearly: NEVER use Alpine with Playwright |

---

## Limitations

- **Dokploy-specific deployment docs were inaccessible** (docs.dokploy.com deployment pages returned empty content — JS-rendered SPA docs). Recommendations based on GitHub README, general app docs, and Dokploy's Docker Compose support.
- **No benchmarking done.** Memory/time estimates are from Playwright docs and community reports, not measured on target VPS.
- **Seccomp profile is minimal.** For production scraping of untrusted sites, extend from Docker's default seccomp profile and add the namespace syscalls.
- **No distributed scraping architecture covered.** This is single-container. For multi-container/scaling, consider a job queue (BullMQ + Redis) with separate worker containers.

---

## Unresolved Questions

1. What VPS specs are planned? (affects memory limits, concurrency tuning)
2. Are there known target sites that always need Playwright? (could simplify to an allowlist instead of heuristics)
3. Is there an existing scraping frequency/volume requirement? (affects browser pool sizing)
4. Will scraped data be stored or processed in real-time? (affects whether we need persistent volumes)

---

## Sources

- Playwright Docker docs: https://playwright.dev/docs/docker
- Playwright Browsers docs: https://playwright.dev/docs/browsers
- Next.js Docker example: https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile
- Next.js deployment docs: https://nextjs.org/docs/app/building-your-application/deploying
- Dokploy GitHub: https://github.com/Dokploy/dokploy
- Dokploy docs: https://docs.dokploy.com
- Dokploy applications overview: https://docs.dokploy.com/docs/core/applications
