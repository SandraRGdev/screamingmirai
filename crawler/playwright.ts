import { chromium, type Browser, type Page } from "playwright";

let browserInstance: Browser | null = null;

const MAX_HTML_LENGTH = 5 * 1024 * 1024; // 5 MB — matches fetcher.ts limit

const BLOCKED_RESOURCE_TYPES = new Set(["image", "font", "stylesheet", "media"]);

/** Get or create a shared Chromium browser instance */
export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });
  }
  return browserInstance;
}

/** Close the browser singleton */
export async function closeBrowser(): Promise<void> {
  if (browserInstance?.isConnected()) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/** Fetch a URL with Playwright. Returns HTML content after JS rendering. */
export async function fetchWithPlaywright(
  url: string,
  timeoutMs: number = 30_000,
): Promise<{ html: string; status: number; contentType: string } | null> {
  let browser: Browser;
  let page: Page | null = null;

  try {
    browser = await getBrowser();
    page = await browser.newPage();

    // Block non-essential resources for speed
    await page.route("**/*", (route) => {
      if (BLOCKED_RESOURCE_TYPES.has(route.request().resourceType())) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const response = await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: "domcontentloaded",
    });

    if (!response) return null;

    const html = await page.content();

    // Guard against unbounded HTML (matches fetcher.ts 5MB limit)
    if (html.length > MAX_HTML_LENGTH) return null;

    const status = response.status();
    const contentType = response.headers()["content-type"] || "";

    return { html, status, contentType };
  } catch {
    return null;
  } finally {
    if (page) await page.close();
  }
}

// Graceful shutdown
process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);
