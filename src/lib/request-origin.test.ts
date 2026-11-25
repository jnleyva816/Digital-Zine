import { describe, expect, it } from "vitest";
import { checkSameOrigin } from "./request-origin";

// DIG-104: one rule for "did this state-changing request come from our own pages?"
const here = { host: "folio-digital-zine.app" };
const check = (over: Partial<Parameters<typeof checkSameOrigin>[0]> = {}) => checkSameOrigin({ method: "POST", ...here, ...over });

describe("checkSameOrigin", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("never blocks a safe %s request", (method) => {
    expect(check({ method, origin: "https://evil.example" }).ok).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "post"])("accepts a %s from this site's own origin", (method) => {
    expect(check({ method, origin: "https://folio-digital-zine.app" }).ok).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("refuses a %s from another site", (method) => {
    const result = check({ method, origin: "https://evil.example" });
    expect(result.ok).toBe(false);
  });

  it("refuses a look-alike host, including one that contains ours", () => {
    for (const origin of [
      "https://folio-digital-zine.app.evil.example",
      "https://evilfolio-digital-zine.app",
      "https://folio-digital-zine.app@evil.example",
      "http://folio-digital-zine.app.evil.example:443",
    ]) {
      expect(check({ origin }).ok, origin).toBe(false);
    }
  });

  it("treats the same host on another port or scheme as another origin only when the host differs", () => {
    expect(check({ host: "localhost:3417", origin: "http://localhost:3417" }).ok).toBe(true);
    expect(check({ host: "localhost:3417", origin: "http://localhost:4000" }).ok).toBe(false);
  });

  it("follows the host the browser used behind a proxy", () => {
    expect(check({ host: "localhost:8080", forwardedHost: "folio-digital-zine.app", origin: "https://folio-digital-zine.app" }).ok).toBe(true);
    expect(check({ host: "localhost:8080", forwardedHost: "folio-digital-zine.app, internal", origin: "https://folio-digital-zine.app" }).ok).toBe(true);
    expect(check({ host: "localhost:8080", forwardedHost: "folio-digital-zine.app", origin: "https://localhost:8080" }).ok).toBe(false);
  });

  it("refuses the opaque 'null' origin", () => {
    expect(check({ origin: "null" }).ok).toBe(false);
  });

  it("refuses an origin that is not a URL", () => {
    expect(check({ origin: "not a url" }).ok).toBe(false);
  });

  it("without an Origin, goes by Sec-Fetch-Site", () => {
    expect(check({ secFetchSite: "same-origin" }).ok).toBe(true);
    expect(check({ secFetchSite: "none" }).ok).toBe(true);
    expect(check({ secFetchSite: "cross-site" }).ok).toBe(false);
    expect(check({ secFetchSite: "same-site" }).ok).toBe(false);
  });

  it("lets a request with neither header through: only a browser can be tricked, and a browser sends one", () => {
    expect(check({}).ok).toBe(true);
  });

  it("lets a configured extra origin through, exactly", () => {
    const allowedOrigins = ["https://preview.example.com"];
    expect(check({ origin: "https://preview.example.com", allowedOrigins }).ok).toBe(true);
    expect(check({ origin: "https://other.example.com", allowedOrigins }).ok).toBe(false);
  });

  it("says why it refused, for the logs", () => {
    const result = check({ origin: "https://evil.example" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/origin/i);
  });
});
