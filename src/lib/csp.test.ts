import { describe, expect, it } from "vitest";
import { buildCsp, cspHeaderName, cspMode } from "./csp";

// DIG-104: the Content Security Policy, as a pure function of the request's nonce and the environment.
const NONCE = "aGVsbG93b3JsZDEyMzQ1Ng==";
const prod = {
  NODE_ENV: "production",
  AWS_S3_PUBLIC_URL: "https://pub-abc123.r2.dev",
  AWS_S3_ENDPOINT: "https://acct1234.r2.cloudflarestorage.com",
  NEXT_PUBLIC_SENTRY_DSN: "https://publickey@o123456.ingest.us.sentry.io/789",
};

/** The sources of one directive, e.g. directive(csp, "img-src") -> ["'self'", "data:", ...]. */
function directive(csp: string, name: string): string[] | null {
  const found = csp.split(";").map((d) => d.trim()).find((d) => d.split(/\s+/)[0] === name);
  return found ? found.split(/\s+/).slice(1) : null;
}

describe("buildCsp", () => {
  const csp = buildCsp({ nonce: NONCE, env: prod });

  it("runs scripts only from this site's own nonce-tagged scripts, with no unsafe-inline", () => {
    const scripts = directive(csp, "script-src")!;
    expect(scripts).toContain(`'nonce-${NONCE}'`);
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("allows eval only in development, where Next's tooling needs it", () => {
    const dev = buildCsp({ nonce: NONCE, env: { NODE_ENV: "development" } });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
  });

  it("locks down plugins, framing, and base URLs", () => {
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "frame-src")).toEqual(["'none'"]);
  });

  it("lets forms and redirects reach only this site, Google sign-in, and Stripe", () => {
    expect(directive(csp, "form-action")).toEqual(
      expect.arrayContaining(["'self'", "https://accounts.google.com", "https://checkout.stripe.com", "https://billing.stripe.com"])
    );
  });

  it("loads images from this site, from storage, and from data and blob URLs", () => {
    expect(directive(csp, "img-src")).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https://pub-abc123.r2.dev"]));
  });

  it("lets the browser connect to this site, to storage for uploads, and to Sentry, and nowhere else", () => {
    expect(directive(csp, "connect-src")).toEqual(["'self'", "https://acct1234.r2.cloudflarestorage.com", "https://o123456.ingest.us.sentry.io"]);
  });

  it("keeps styles to this site's own, with inline styles because React sets style attributes", () => {
    expect(directive(csp, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(csp, "font-src")).toEqual(["'self'", "data:"]);
  });

  it("never uses a wildcard, and never allows plain http in production", () => {
    expect(csp).not.toMatch(/(^|[\s;])\*([\s;]|$)/);
    expect(csp).not.toContain("http:");
  });

  it("upgrades insecure requests in production only, so local http still works", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    expect(buildCsp({ nonce: NONCE, env: { NODE_ENV: "development" } })).not.toContain("upgrade-insecure-requests");
  });

  it("reports violations to this site", () => {
    expect(directive(csp, "report-uri")).toEqual(["/api/csp-report"]);
  });

  it("adds an image CDN's origin when one is configured", () => {
    const withCdn = buildCsp({ nonce: NONCE, env: { ...prod, NEXT_PUBLIC_IMAGE_CDN_URL: "https://cdn.example.com/cdn-cgi/image" } });
    expect(directive(withCdn, "img-src")).toContain("https://cdn.example.com");
  });

  it("leaves out anything not configured or not a valid URL, without writing 'undefined'", () => {
    const bare = buildCsp({ nonce: NONCE, env: { NODE_ENV: "production", AWS_S3_PUBLIC_URL: "not a url", SENTRY_DSN: "" } });
    expect(bare).not.toContain("undefined");
    expect(directive(bare, "connect-src")).toEqual(["'self'"]);
    expect(directive(bare, "img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("refuses a nonce that could break out of the header", () => {
    for (const bad of ["", "short", "has space in it 123456", "semi;colon-12345678901", "quote'12345678901234"]) {
      expect(() => buildCsp({ nonce: bad, env: prod })).toThrow(/nonce/i);
    }
  });
});

describe("report-only first, then enforce", () => {
  it("reports only, unless CSP_MODE says enforce", () => {
    expect(cspMode({})).toBe("report-only");
    expect(cspMode({ CSP_MODE: "" })).toBe("report-only");
    expect(cspMode({ CSP_MODE: "nonsense" })).toBe("report-only");
    expect(cspMode({ CSP_MODE: "enforce" })).toBe("enforce");
    expect(cspMode({ CSP_MODE: " Enforce " })).toBe("enforce");
  });

  it("uses the header name that matches the mode", () => {
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
  });
});
