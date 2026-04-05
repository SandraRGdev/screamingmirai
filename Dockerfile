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

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash pwuser

# Install only the runtime system deps Playwright needs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libxshmfence1 libxfixes3 \
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
# Build cache bust
