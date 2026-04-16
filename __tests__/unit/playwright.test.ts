import { describe, expect, it, vi } from "vitest";

const { launchMock } = vi.hoisted(() => ({
  launchMock: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: launchMock,
  },
}));

import { fetchWithPlaywright } from "@/crawler/playwright";

describe("fetchWithPlaywright", () => {
  it("returns null when Chromium cannot launch", async () => {
    launchMock.mockRejectedValueOnce(
      new Error(
        "Executable doesn't exist at /Users/sandra/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell",
      ),
    );

    await expect(fetchWithPlaywright("https://example.com")).resolves.toBeNull();
  });
});
