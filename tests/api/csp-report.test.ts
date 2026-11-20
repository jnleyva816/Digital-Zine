import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { POST } from "@/app/api/csp-report/route";
import { resetRateLimits } from "./helpers";

// DIG-104: where the browser reports what the Content Security Policy blocked.
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
const captured = vi.mocked(Sentry.captureMessage);

const report = (body: unknown, contentType = "application/csp-report", ip = "203.0.113.5") =>
  POST(
    new Request("http://test.local/api/csp-report", {
      method: "POST",
      headers: { "content-type": contentType, "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

const legacy = (over: Record<string, unknown> = {}) => ({
  "csp-report": {
    "document-uri": "https://folio-digital-zine.app/z/ab12cd34/cars",
    "violated-directive": "img-src",
    "effective-directive": "img-src",
    "blocked-uri": "https://tracker.example/pixel.gif",
    ...over,
  },
});

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await resetRateLimits();
  captured.mockClear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe("POST /api/csp-report", () => {
  it("accepts a classic report with 204, logs one short line, and sends it to Sentry", async () => {
    const res = await report(legacy());
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toBe("CSP violation: img-src blocked https://tracker.example/pixel.gif on https://folio-digital-zine.app/z/ab12cd34/cars");
    expect(captured).toHaveBeenCalledTimes(1);
    expect(captured.mock.calls[0][0]).toContain("img-src");
    expect(captured.mock.calls[0][1]).toMatchObject({ level: "warning" });
  });

  it("accepts the Reporting API format, one report or several", async () => {
    const body = [
      { type: "csp-violation", body: { documentURL: "https://x.test/a", effectiveDirective: "script-src-elem", blockedURL: "inline" } },
      { type: "deprecation", body: { id: "x" } },
      { type: "csp-violation", body: { documentURL: "https://x.test/b", effectiveDirective: "connect-src", blockedURL: "https://evil.test/x" } },
    ];
    const res = await report(body, "application/reports+json");
    expect(res.status).toBe(204);
    // Only the two CSP violations count.
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain("script-src-elem blocked inline on https://x.test/a");
  });

  it("strips query strings and fragments, so a token in a URL never reaches the logs or Sentry", async () => {
    await report(
      legacy({
        "document-uri": "https://folio-digital-zine.app/verify-email?token=SUPERSECRET#frag",
        "blocked-uri": "https://evil.test/p.gif?session=ALSOSECRET",
      })
    );
    const everything = JSON.stringify([warn.mock.calls, captured.mock.calls]);
    expect(everything).not.toContain("SUPERSECRET");
    expect(everything).not.toContain("ALSOSECRET");
    expect(everything).not.toContain("#frag");
    expect(String(warn.mock.calls[0][0])).toContain("https://folio-digital-zine.app/verify-email");
  });

  it("cuts long fields short, so a report cannot flood the logs", async () => {
    await report(legacy({ "blocked-uri": `https://evil.test/${"a".repeat(5000)}` }));
    expect(String(warn.mock.calls[0][0]).length).toBeLessThan(500);
  });

  it("ignores anything that is not a report, quietly, with 204", async () => {
    for (const body of ["not json", "{}", "[]", '{"csp-report":"x"}', "null", '[1,2,3]']) {
      const res = await report(body);
      expect(res.status, body).toBe(204);
    }
    expect(warn).not.toHaveBeenCalled();
    expect(captured).not.toHaveBeenCalled();
  });

  it("refuses a body over 8 KB with 413", async () => {
    const res = await report(legacy({ "script-sample": "x".repeat(9000) }));
    expect(res.status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it("answers 429 once one address has sent 60 reports in a minute, and does not log the extra ones", async () => {
    for (let i = 0; i < 60; i++) expect((await report(legacy(), undefined, "198.51.100.9")).status).toBe(204);
    warn.mockClear();
    const res = await report(legacy(), undefined, "198.51.100.9");
    expect(res.status).toBe(429);
    expect(warn).not.toHaveBeenCalled();
    // Another address is unaffected.
    expect((await report(legacy(), undefined, "198.51.100.10")).status).toBe(204);
  });
});
