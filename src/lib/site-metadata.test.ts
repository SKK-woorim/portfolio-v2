import { describe, expect, it } from "vitest";
import { createSocialImage, DEFAULT_OG_IMAGE_PATH, resolveSiteUrl } from "./site-metadata";

describe("site URL validation", () => {
  it("requires an origin in production", () => {
    expect(() => resolveSiteUrl({ NODE_ENV: "production" })).toThrow("production site URL");
  });

  it("uses the Vercel production hostname with HTTPS when no explicit URL is set", () => {
    expect(resolveSiteUrl({ NODE_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "portfolio.example.vercel.app" }).toString()).toBe("https://portfolio.example.vercel.app/");
  });

  it("rejects credentials, non-web schemes, and non-origin paths", () => {
    expect(() => resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://user:pass@example.com" })).toThrow();
    expect(() => resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "ftp://example.com" })).toThrow();
    expect(() => resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.com/portfolio" })).toThrow();
  });

  it("falls back to local development only outside production", () => {
    expect(resolveSiteUrl({ NODE_ENV: "development" }).toString()).toBe("http://localhost:3000/");
  });

  it("provides a share image when published content has no cover media", () => {
    expect(createSocialImage(undefined)).toMatchObject({ url: DEFAULT_OG_IMAGE_PATH, width: 1200, height: 630 });
  });
});
