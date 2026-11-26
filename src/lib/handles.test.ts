import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HANDLE_MAX, HANDLE_MIN, checkHandle, isReservedHandle, normalizeHandle } from "@/lib/handles";

// DIG-111: creators pick a handle for /u/<handle>.
describe("normalizeHandle", () => {
  it("trims, drops a leading @, and lowercases", () => {
    expect(normalizeHandle("  @Film_Lover ")).toBe("film_lover");
    expect(normalizeHandle("ABC")).toBe("abc");
  });
});

describe("checkHandle", () => {
  it("accepts letters, digits, and underscores, any case, stored lowercase", () => {
    expect(checkHandle("Classic_Neg23")).toEqual({ ok: true, handle: "classic_neg23" });
    expect(checkHandle("@abc")).toEqual({ ok: true, handle: "abc" });
  });

  it(`needs ${HANDLE_MIN} to ${HANDLE_MAX} characters`, () => {
    expect(checkHandle("ab")).toMatchObject({ ok: false, code: "handle_invalid" });
    expect(checkHandle("a".repeat(HANDLE_MAX))).toMatchObject({ ok: true });
    expect(checkHandle("a".repeat(HANDLE_MAX + 1))).toMatchObject({ ok: false, code: "handle_invalid" });
  });

  it("refuses spaces, dots, dashes, slashes, non-Latin look-alikes, and edge underscores", () => {
    for (const bad of ["film lover", "film.lover", "film-lover", "film/lover", "../admin", "fіlm", "ﬁlm", "_film", "film_", "", "@"]) {
      expect(checkHandle(bad), bad).toMatchObject({ ok: false, code: "handle_invalid" });
    }
  });

  it("refuses reserved words whatever their case", () => {
    for (const word of ["admin", "ADMIN", "@Folio", "api", "settings", "discover", "support"]) {
      expect(checkHandle(word), word).toMatchObject({ ok: false, code: "handle_reserved" });
    }
  });

  it("refuses non-strings", () => {
    expect(checkHandle(42)).toMatchObject({ ok: false, code: "handle_invalid" });
    expect(checkHandle(null)).toMatchObject({ ok: false, code: "handle_invalid" });
  });
});

describe("isReservedHandle", () => {
  it("reserves every top-level route of the app, so a page added later cannot be claimed", () => {
    const appDir = path.join(process.cwd(), "src/app");
    // Route groups, dynamic segments, private folders, and names with a dot (`.well-known`,
    // `llms.txt`) cannot collide: a handle has no brackets, parentheses, dots, or leading underscore.
    const routes = readdirSync(appDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !/^[([_]|\./.test(e.name))
      .map((e) => e.name.toLowerCase().replaceAll("-", "_"));
    expect(routes.length).toBeGreaterThan(5);
    for (const route of routes) expect(isReservedHandle(route), route).toBe(true);
  });

  it("does not reserve ordinary names", () => {
    expect(isReservedHandle("classic_neg")).toBe(false);
  });
});
