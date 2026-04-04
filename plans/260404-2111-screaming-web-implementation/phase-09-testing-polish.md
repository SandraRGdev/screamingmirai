---
title: "Phase 9: Testing & Polish"
description: "Add comprehensive tests, documentation, and prepare for v1.0.0 release"
status: pending
priority: P1
effort: 4h
branch: feature/testing-polish
version: v0.9.0
tags: [testing, documentation, release]
created: 2026-04-04
---

# Phase 9: Testing & Polish

## Context

**Related Reports:**
- All previous phases (implementation context)

**Overview:**
Add comprehensive testing, write documentation, polish UI/UX, and prepare for v1.0.0 production release.

## Key Insights

1. Test crawler logic independently (unit tests)
2. Test API routes with integration tests
3. Test UI components with React Testing Library
4. Add E2E test for full crawl flow
5. Write clear README with quick start

## Requirements

### Functional Requirements
- Unit tests for crawler modules
- Integration tests for API routes
- Component tests for UI
- E2E test for crawl → export flow
- Comprehensive README
- CHANGELOG.md

### Non-Functional Requirements
- Test coverage >70%
- All tests pass
- Documentation is clear

## Architecture

### Test Structure

```
__tests__/
├── unit/
│   ├── url-utils.test.ts
│   ├── parser.test.ts
│   └── export.test.ts
├── integration/
│   ├── crawl-api.test.ts
│   └── export-api.test.ts
├── e2e/
│   └── crawl-flow.spec.ts
└── __mocks__/
    └── playwright.ts
```

## Related Code Files

### Files to Create
- `__tests__/unit/url-utils.test.ts`
- `__tests__/unit/parser.test.ts`
- `__tests__/unit/export.test.ts`
- `__tests__/integration/crawl-api.test.ts`
- `__tests__/e2e/crawl-flow.spec.ts`
- `README.md`
- `CHANGELOG.md`
- `jest.config.js`

### Files to Modify
- `package.json` — Add test scripts
- `.eslintrc.json` — Config if needed

## Implementation Steps

1. **Install testing dependencies**
   ```bash
   npm install -D jest @types/jest ts-jest
   npm install -D @testing-library/react @testing-library/jest-dom
   npm install -D @playwright/test
   ```

2. **Create Jest config** — `jest.config.js`:
   ```js
   module.exports = {
     preset: 'ts-jest',
     testEnvironment: 'node',
     roots: ['<rootDir>'],
     testMatch: ['**/__tests__/**/*.test.ts'],
     moduleNameMapper: {
       '^@/(.*)$': '<rootDir>/$1',
     },
     setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
   };
   ```

3. **Create Jest setup** — `jest.setup.js`:
   ```js
   process.env.NODE_ENV = 'test';
   ```

4. **Create URL utils tests** — `__tests__/unit/url-utils.test.ts`:
   ```ts
   import { describe, it, expect } from '@jest/globals';
   import { normalizeUrl, isSameDomain, isBlockedExtension } from '@/crawler/url-utils';

   describe('normalizeUrl', () => {
     it('removes fragments', () => {
       expect(normalizeUrl('https://example.com#section'))
         .toBe('https://example.com');
     });

     it('removes trailing slash', () => {
       expect(normalizeUrl('https://example.com/'))
         .toBe('https://example.com');
     });

     it('lowercases hostname', () => {
       expect(normalizeUrl('https://EXAMPLE.COM/Page'))
         .toBe('https://example.com/Page');
     });

     it('handles invalid URLs gracefully', () => {
       expect(normalizeUrl('not-a-url'))
         .toBe('not-a-url');
     });
   });

   describe('isSameDomain', () => {
     it('returns true for same domain', () => {
       expect(isSameDomain('https://example.com/page', 'example.com'))
         .toBe(true);
     });

     it('returns false for different domain', () => {
       expect(isSameDomain('https://other.com/page', 'example.com'))
         .toBe(false);
     });

     it('handles subdomains', () => {
       expect(isSameDomain('https://www.example.com/page', 'example.com'))
         .toBe(false);
     });
   });

   describe('isBlockedExtension', () => {
     const blocked = new Set(['.jpg', '.png', '.pdf']);

     it('blocks image extensions', () => {
       expect(isBlockedExtension('https://example.com/image.jpg', blocked))
         .toBe(true);
     });

     it('blocks PDF extensions', () => {
       expect(isBlockedExtension('https://example.com/doc.pdf', blocked))
         .toBe(true);
     });

     it('allows HTML pages', () => {
       expect(isBlockedExtension('https://example.com/page', blocked))
         .toBe(false);
     });
   });
   ```

5. **Create parser tests** — `__tests__/unit/parser.test.ts`:
   ```ts
   import { describe, it, expect } from '@jest/globals';
   import { parseHtml, isIndexable } from '@/crawler/parser';

   const mockFetchResult = {
     html: '<html><head><title>Test</title></head><body><a href="/page1">Link</a></body></html>',
     status: 200,
     contentType: 'text/html',
     url: 'https://example.com',
   };

   describe('parseHtml', () => {
     it('extracts title', () => {
       const result = parseHtml(mockFetchResult, 0, 'example.com');
       expect(result.title).toBe('Test');
     });

     it('extracts internal links', () => {
       const result = parseHtml(mockFetchResult, 0, 'example.com');
       expect(result.internalLinks).toContain('https://example.com/page1');
     });

     it('handles missing title', () => {
       const noTitle = { ...mockFetchResult, html: '<html><body></body></html>' };
       const result = parseHtml(noTitle, 0, 'example.com');
       expect(result.title).toBeNull();
     });
   });

   describe('isIndexable', () => {
     it('returns true when no meta robots', () => {
       expect(isIndexable(null)).toBe(true);
     });

     it('returns true for indexable pages', () => {
       expect(isIndexable('index, follow')).toBe(true);
     });

     it('returns false for noindex', () => {
       expect(isIndexable('noindex, follow')).toBe(false);
     });

     it('returns false for none', () => {
       expect(isIndexable('none')).toBe(false);
     });
   });
   ```

6. **Create export tests** — `__tests__/unit/export.test.ts`:
   ```ts
   import { describe, it, expect } from '@jest/globals';
   import { exportAsCsv, exportAsJson } from '@/utils/export';
   import type { CrawlResult } from '@/lib/types';

   const mockResults: CrawlResult[] = [
     {
       url: 'https://example.com',
       status: 200,
       contentType: 'text/html',
       depth: 0,
       title: 'Home',
       canonical: null,
       metaRobots: null,
       esIndexable: true,
       inlinks: 0,
       discoveredFrom: null,
     },
   ];

   describe('exportAsJson', () => {
     it('exports valid JSON', () => {
       const json = exportAsJson(mockResults);
       const parsed = JSON.parse(json);
       expect(parsed.results).toHaveLength(1);
       expect(parsed.results[0].url).toBe('https://example.com');
     });
   });

   describe('exportAsCsv', () => {
     it('exports valid CSV', () => {
       const csv = exportAsCsv(mockResults);
       const lines = csv.split('\n');
       expect(lines[0]).toContain('URL');
       expect(lines[1]).toContain('https://example.com');
     });

     it('escapes commas', () => {
       const withComma: CrawlResult = {
         ...mockResults[0],
         title: 'Hello, world',
       };
       const csv = exportAsCsv([withComma]);
       expect(csv).toContain('"Hello, world"');
     });
   });
   ```

7. **Create E2E test** — `__tests__/e2e/crawl-flow.spec.ts`:
   ```ts
   import { test, expect } from '@playwright/test';

   test.describe('Crawl Flow', () => {
     test.beforeEach(async ({ page }) => {
       await page.goto('http://localhost:3000');
     });

     test('displays crawl form', async ({ page }) => {
       await expect(page.locator('input[type="url"]')).toBeVisible();
       await expect(page.getByText('Start Crawl')).toBeVisible();
     });

     test('starts crawl and shows progress', async ({ page }) => {
       await page.fill('input[type="url"]', 'https://example.com');
       await page.click('button:has-text("Start Crawl")');

       await expect(page.getByText(/Crawling\.\.\./)).toBeVisible({ timeout: 5000 });
       await expect(page.locator('[role="progressbar"]')).toBeVisible();
     });

     test('shows results after completion', async ({ page }) => {
       await page.fill('input[type="url"]', 'https://example.com');
       await page.click('button:has-text("Start Crawl")');

       // Wait for completion (may take time)
       await expect(page.getByText(/Completed/)).toBeVisible({ timeout: 60000 });
       await expect(page.getByText(/Total URLs/)).toBeVisible();
     });
   });
   ```

8. **Create README** — `README.md`:
   ```markdown
   # ScreamingWeb

   A browser-based SEO crawler that discovers internal HTML URLs using BFS traversal.

   ## Features

   - BFS crawl from seed URL
   - Hybrid fetching: Cheerio (fast) + Playwright (JS fallback)
   - Real-time progress via SSE
   - Sortable/filterable results table
   - CSV/JSON export
   - robots.txt respect

   ## Quick Start

   ### With Docker

   \`\`\`bash
   docker-compose up --build
   \`\`\`

   Visit http://localhost:3000

   ### Local Development

   \`\`\`bash
   npm install
   npm run dev
   \`\`\`

   ## Usage

   1. Enter a starting URL
   2. Configure max depth and page limit
   3. Toggle JavaScript rendering if needed
   4. Click "Start Crawl"
   5. View results in real-time
   6. Export as CSV or JSON

   ## Deployment

   See [docs/deployment.md](./docs/deployment.md) for Dokploy instructions.

   ## License

   MIT
   ```

9. **Create CHANGELOG** — `CHANGELOG.md`:
   ```markdown
   # Changelog

   ## [Unreleased]

   ## [1.0.0] - 2026-04-04

   ### Added
   - BFS crawler with queue and visited set
   - Hybrid fetch (Cheerio + Playwright fallback)
   - Real-time progress via SSE
   - Sortable/filterable results table
   - CSV/JSON export
   - robots.txt respect
   - Docker deployment

   ### Dependencies
   - Next.js 15
   - Playwright 1.58
   - Cheerio 1.0
   - TanStack Table 8
   - shadcn/ui
   ```

10. **Update package.json scripts**
    ```json
    {
      "scripts": {
        "dev": "next dev",
        "build": "next build",
        "start": "next start",
        "lint": "next lint",
        "test": "jest",
        "test:e2e": "playwright test",
        "test:watch": "jest --watch"
      }
    }
    ```

11. **Run all tests**
    ```bash
    npm run test
    npm run test:e2e
    ```

12. **Final polish**
    - Check all UI components for accessibility
    - Verify error messages are helpful
    - Test with real websites
    - Verify Docker image size

## Success Criteria

- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Coverage >70%
- [ ] README is clear
- [ ] CHANGELOG documents changes
- [ ] Docker image builds and runs

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Flaky E2E tests | Medium | Medium | Retry logic, timeouts |
| Low coverage | Low | Low | Focus on critical paths |
| Documentation gaps | Low | Medium | Review README |

## Rollback Plan

If testing reveals blocking issues:
1. Fix critical bugs only
2. Defer non-critical polish to v1.1.0
3. Document known issues

## Dependencies

- **Blocked by:** Phase 8 (Docker)
- **Blocks:** v1.0.0 release
- **External:** None

## Next Steps

1. Merge `feature/testing-polish` → `develop`
2. Tag `v0.9.0` on merge
3. Create release branch from `develop`
4. Tag `v1.0.0` on `main`
5. Deploy to production
