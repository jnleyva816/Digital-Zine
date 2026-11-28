import { describe, expect, it } from "vitest";
import { absoluteUrl, siteUrl } from "./site";

// DIG-106: one place that says where the site lives, so robots, sitemap, and JSON-LD agree.
describe("siteUrl", () => {
  it("is the configured address without a trailing slash", () => {
    expect(siteUrl({ NEXT_PUBLIC_APP_URL: "https://folio-digital-zine.app/" })).toBe("https://folio-digital-zine.app");
    expect(siteUrl({ NEXT_PUBLIC_APP_URL: "  https://folio-digital-zine.app  " })).toBe("https://folio-digital-zine.app");
  });

  it("falls back to localhost when nothing is configured", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
    expect(siteUrl({ NEXT_PUBLIC_APP_URL: "   " })).toBe("http://localhost:3000");
  });
});

describe("absoluteUrl", () => {
  const env = { NEXT_PUBLIC_APP_URL: "https://folio-digital-zine.app" };

  it("puts a path on the site", () => {
    expect(absoluteUrl("/terms", env)).toBe("https://folio-digital-zine.app/terms");
    expect(absoluteUrl("/", env)).toBe("https://folio-digital-zine.app/");
  });

  it("leaves a full address alone, such as a photo served from the image CDN", () => {
    expect(absoluteUrl("https://cdn.example.com/a/og.jpg", env)).toBe("https://cdn.example.com/a/og.jpg");
  });
});
