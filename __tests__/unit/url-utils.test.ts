import { describe, it, expect } from "vitest";
import {
  normalizeUrl,
  getDomain,
  isSameDomain,
  isBlockedExtension,
  resolveUrl,
  isHtmlContentType,
  isPrivateHostname,
  isSafeUrl,
} from "@/crawler/url-utils";
import { DEFAULT_BLOCKED_EXTENSIONS } from "@/crawler/types";

describe("normalizeUrl", () => {
  it("removes fragments", () => {
    expect(normalizeUrl("https://example.com#section")).toBe(
      "https://example.com",
    );
  });

  it("removes trailing slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("preserves path", () => {
    expect(normalizeUrl("https://example.com/page/")).toBe(
      "https://example.com/page",
    );
  });

  it("lowercases hostname", () => {
    expect(normalizeUrl("https://EXAMPLE.COM/Page")).toBe(
      "https://example.com/Page",
    );
  });

  it("handles invalid URLs gracefully", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });

  it("strips only fragment, preserves query params", () => {
    expect(normalizeUrl("https://example.com/search?q=test#top")).toBe(
      "https://example.com/search?q=test",
    );
  });
});

describe("getDomain", () => {
  it("extracts hostname", () => {
    expect(getDomain("https://www.example.com/page")).toBe("www.example.com");
  });

  it("returns empty for invalid URL", () => {
    expect(getDomain("")).toBe("");
  });
});

describe("isSameDomain", () => {
  it("returns true for same domain", () => {
    expect(isSameDomain("https://example.com/page", "example.com")).toBe(true);
  });

  it("returns false for different domain", () => {
    expect(isSameDomain("https://other.com/page", "example.com")).toBe(false);
  });

  it("returns false for subdomain", () => {
    expect(isSameDomain("https://www.example.com/page", "example.com")).toBe(
      false,
    );
  });

  it("returns false for invalid URL", () => {
    expect(isSameDomain("not-a-url", "example.com")).toBe(false);
  });
});

describe("isBlockedExtension", () => {
  it("blocks image extensions", () => {
    expect(isBlockedExtension("https://example.com/image.jpg")).toBe(true);
  });

  it("blocks PDF extensions", () => {
    expect(isBlockedExtension("https://example.com/doc.pdf")).toBe(true);
  });

  it("allows HTML pages", () => {
    expect(isBlockedExtension("https://example.com/page")).toBe(false);
  });

  it("allows pages with no extension", () => {
    expect(isBlockedExtension("https://example.com/about")).toBe(false);
  });

  it("blocks CSS files", () => {
    expect(isBlockedExtension("https://example.com/style.css")).toBe(true);
  });

  it("uses default blocked extensions when not provided", () => {
    expect(isBlockedExtension("https://example.com/script.js")).toBe(true);
  });
});

describe("resolveUrl", () => {
  it("resolves relative paths", () => {
    expect(resolveUrl("/page", "https://example.com/")).toBe(
      "https://example.com/page",
    );
  });

  it("returns absolute URLs as-is", () => {
    expect(resolveUrl("https://other.com", "https://example.com/")).toBe(
      "https://other.com/",
    );
  });

  it("returns null for invalid base", () => {
    expect(resolveUrl("/page", "")).toBeNull();
  });
});

describe("isHtmlContentType", () => {
  it("returns true for text/html", () => {
    expect(isHtmlContentType("text/html")).toBe(true);
  });

  it("returns true for text/html with charset", () => {
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
  });

  it("returns false for application/json", () => {
    expect(isHtmlContentType("application/json")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isHtmlContentType(null)).toBe(false);
  });
});

describe("isPrivateHostname", () => {
  it("blocks localhost", () => {
    expect(isPrivateHostname("localhost")).toBe(true);
  });

  it("blocks 127.0.0.1", () => {
    expect(isPrivateHostname("127.0.0.1")).toBe(true);
  });

  it("blocks 10.x.x.x", () => {
    expect(isPrivateHostname("10.0.0.1")).toBe(true);
  });

  it("blocks 192.168.x.x", () => {
    expect(isPrivateHostname("192.168.1.1")).toBe(true);
  });

  it("allows public IPs", () => {
    expect(isPrivateHostname("93.184.216.34")).toBe(false);
  });

  it("allows normal hostnames", () => {
    expect(isPrivateHostname("example.com")).toBe(false);
  });

  it("blocks .local TLD", () => {
    expect(isPrivateHostname("myserver.local")).toBe(true);
  });
});

describe("isSafeUrl", () => {
  it("allows HTTPS URLs", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
  });

  it("allows HTTP URLs", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("blocks javascript: protocol", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });

  it("blocks localhost", () => {
    expect(isSafeUrl("http://localhost:3000")).toBe(false);
  });

  it("blocks private IPs", () => {
    expect(isSafeUrl("http://192.168.1.1")).toBe(false);
  });
});
