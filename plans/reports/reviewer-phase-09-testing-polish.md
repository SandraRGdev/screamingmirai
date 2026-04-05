# Phase 09 Review: Testing & Polish

## Scope

- Files: `__tests__/unit/url-utils.test.ts`, `__tests__/unit/parser.test.ts`, `__tests__/unit/export.test.ts`, `__tests__/setup.ts`, `vitest.config.ts`, `README.md`, `CHANGELOG.md`, `package.json`
- LOC: 620 total (190 + 113 + 154 + 1 + 15 + 123 + 24)
- Focus: Phase 9 -- unit tests, documentation, project polish
- Tests: 69 pass, 0 fail (verified)

## Overall Assessment

Solid phase delivery. 69 well-structured unit tests covering the three most critical pure-logic modules (URL utils, HTML parser, export). README is accurate and complete. CHANGELOG is well-organized. Vitest config is correct with proper path alias resolution. All files under 200 lines.

One type-check error and several test coverage gaps are the main items to address.

## Critical Issues

None.

## High Priority

### H1. TypeScript strict-mode violation in setup.ts

**File:** `__tests__/setup.ts`
**Error:** `TS2540: Cannot assign to 'NODE_ENV' because it is a read-only property.`

`tsc --noEmit` fails on this line:
```ts
process.env.NODE_ENV = "test";
```

The `process.env` is typed with `NODE_ENV` as readonly in the default Node.js type definitions. This doesn't break Vitest (Vitest ignores tsc), but it will fail any CI step that runs `tsc --noEmit` before tests.

**Fix:**
```ts
(process.env as Record<string, string>).NODE_ENV = "test";
```

Or simply remove the line -- Vitest automatically sets `NODE_ENV=test` in the test environment. The `environment: "node"` config already handles this.

### H2. SSRF protection coverage gaps in url-utils tests

**File:** `__tests__/unit/url-utils.test.ts`

`isPrivateHostname()` guards against 8 private/reserved ranges. Tests only cover 4 of them:

| Range | Tested? |
|-------|---------|
| localhost | Yes |
| 127.0.0.1 | Yes |
| 10.x.x.x | Yes |
| 192.168.x.x | Yes |
| 172.16-31.x.x | **No** |
| 169.254.x.x (link-local) | **No** |
| 100.64-127.x.x (CGNAT) | **No** |
| ::1 / [::1] (IPv6 loopback) | **No** |
| .internal / .localhost TLDs | **No** |

SSRF protection is a security-critical function. Untested ranges could silently break without detection. Add tests for each missing range.

### H3. Parser test missing `tel:` and bare `#` link filtering

**File:** `__tests__/unit/parser.test.ts`

The parser explicitly filters `tel:` links and bare `#` fragments (lines 34-36 in parser.ts), but neither has a corresponding test. Only `javascript:` and `mailto:` are tested.

**Missing tests:**
- `tel:+1234567890` links should be skipped
- `href="#"` bare fragment links should be skipped

## Medium Priority

### M1. `downloadFile` is untested

**File:** `utils/export.ts` (lines 54-68)

`downloadFile()` is a browser-only function that creates a Blob and triggers a download. It is not unit-testable without DOM mocking, which is fine -- but it should be acknowledged. The test file imports from `@/utils/export` but only tests `exportAsJson`, `exportAsCsv`, and `generateExportFilename`.

**Recommendation:** Add a comment in the test file noting that `downloadFile` is excluded because it requires a DOM environment. No action needed unless integration tests are added later.

### M2. Integration test directory is empty

**File:** `__tests__/integration/` (empty directory)

The directory exists but has no tests. This is fine for Phase 9 scope, but the empty directory in version control is misleading. Either add a `.gitkeep` or remove it.

### M3. `application/xhtml+xml` content type untested

**File:** `__tests__/unit/url-utils.test.ts`

`isHtmlContentType` accepts both `text/html` and `application/xhtml+xml`, but only `text/html` variants are tested.

### M4. No test for `resolveUrl` with relative path containing `..`

**File:** `__tests__/unit/url-utils.test.ts`

`resolveUrl` is tested with `/page` and absolute URLs but not with `../page` or `./page` relative paths, which are common in real HTML.

### M5. README version claim is slightly imprecise

**File:** `README.md` line 44

States "Next.js 16" and "Tailwind CSS 4" -- technically correct (major version), but the actual installed versions are `next@16.2.2` and `tailwindcss@^4`. Not wrong, just noting for precision.

## Low Priority

### L1. CHANGELOG version mismatch with package.json

**File:** `CHANGELOG.md` lists `[1.0.0]` but `package.json` has `"version": "0.1.0"`. These should match or the CHANGELOG should note this is unreleased.

### L2. No `vitest` type reference

**File:** `vitest.config.ts`

Vitest's `defineConfig` and `test` options work without explicit types, but adding `/// <reference types="vitest" />` or installing `@vitest/coverage-v8` would enable IDE autocompletion for test APIs.

### L3. Test for `isBlockedExtension` with custom blocked set

The function accepts an optional `blocked` parameter, but tests only use the default. One test with a custom set would verify the parameter works.

## Edge Cases Found by Scout

1. **SSRF bypass via 172.x range**: The source correctly blocks 172.16-31.x.x, but no test validates this. A regression in the regex pattern `^172\.(1[6-9]|2\d|3[0-1])\.` would go undetected.

2. **IPv6 loopback bypass**: `::1` and `[::1]` are blocked in code but untested. If the `new URL()` parsing strips brackets differently across Node versions, this could break.

3. **CGNAT range 100.64-127.x.x**: Blocked in source, untested. This range is increasingly used in cloud environments.

4. **CSV export with `\r\n` (CRLF) values**: The `escape` function replaces `[\r\n]+` with space, but tests only check `\n`. A value containing `\r\n` might behave differently.

5. **`normalizeUrl` with data: URLs**: `normalizeUrl("data:text/html,<h1>test</h1>")` would pass through the `catch` block and return the raw string -- this is correct behavior but undocumented.

6. **Parser with malformed HTML**: No test for severely broken HTML (unclosed tags, missing `<html>` wrapper). Cheerio is forgiving, but worth a sanity test.

## Positive Observations

1. **Well-organized test structure** -- Clear `describe/it` grouping, descriptive test names, no duplication.
2. **Proper import usage** -- Tests import from `@/` path aliases matching production code, verifying alias resolution works.
3. **Good edge case coverage for export** -- BOM, CSV escaping (commas, quotes, newlines), empty results all tested.
4. **CSV RFC compliance** -- BOM for Excel, proper quote escaping with double-quotes per CSV spec.
5. **README is comprehensive** -- Quick start, usage walkthrough, tech stack, project structure, scripts, deployment options all covered.
6. **CHANGELOG is concise and complete** -- All major features listed with no fluff.
7. **Vitest config is clean** -- Proper `@` alias, correct setup file reference, node environment.
8. **All files well under 200-line limit** -- Largest test file is 190 lines (url-utils.test.ts).

## Recommended Actions

1. **Fix `__tests__/setup.ts`** -- Remove the `process.env.NODE_ENV` assignment (Vitest handles it) or cast to bypass readonly. This unblocks `tsc --noEmit` in CI. [High]
2. **Add SSRF range tests** -- Cover 172.x, 169.254.x, 100.x, ::1, .internal, .localhost in `isPrivateHostname` tests. [High]
3. **Add `tel:` and `#` filter tests** in parser tests. [High]
4. **Align CHANGELOG version** with package.json (either both `0.1.0` or both `1.0.0`). [Low]
5. **Add `.gitkeep` to empty integration test directory** or remove it. [Medium]

## Metrics

- Type Coverage: tsc fails (1 error in setup.ts)
- Test Coverage: 69/69 pass (100% of written tests)
- Estimated source coverage: ~70% of exported functions have direct tests
- Linting Issues: 0 (not run during review, but no syntax errors)
- Files over 200 lines: 0

## Unresolved Questions

- Should `@vitest/coverage-v8` be added for coverage reporting? It would make coverage gaps visible in CI.
- Is the empty `__tests__/integration/` directory intentional scaffolding for a future phase, or leftover?
