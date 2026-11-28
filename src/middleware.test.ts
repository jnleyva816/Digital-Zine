import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { middleware } from "./middleware";

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const ESC = String.fromCharCode(0x1b);
const NUL = String.fromCharCode(0);

/** A request whose path carries what an attacker would send: line breaks to forge log lines. */
function crossSiteRequest(pathname: string): NextRequest {
  return {
    method: "POST",
    nextUrl: { pathname },
    headers: new Headers({ origin: "https://evil.example", host: "folio.test", "sec-fetch-site": "cross-site" }),
  } as unknown as NextRequest;
}

const isOneLine = (line: string) =>
  !/[\r\n]/.test(line) && !line.includes(LINE_SEPARATOR) && !line.includes(PARAGRAPH_SEPARATOR);
const hasControlCharacter = (line: string) => [...line].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

describe("middleware refusal log (CodeQL js/log-injection)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refuses a cross-site write with 403", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = middleware(crossSiteRequest("/api/zines"));
    expect(res.status).toBe(403);
  });

  it("writes the refusal as one line, whatever the path contains", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    middleware(crossSiteRequest(`/api/zines\nCross-site request refused: GET /admin (forged)\r${LINE_SEPARATOR}x`));
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain("Cross-site request refused: POST /api/zines");
    expect(isOneLine(line)).toBe(true);
  });

  it("strips other control characters too", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    middleware(crossSiteRequest(`/a${ESC}[31mred${NUL}b`));
    expect(hasControlCharacter(String(warn.mock.calls[0][0]))).toBe(false);
  });
});
