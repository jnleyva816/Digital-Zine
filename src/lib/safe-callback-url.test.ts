import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "./safe-callback-url";

describe("safeCallbackUrl", () => {
  it.each([
    ["/board", "/board"],
    ["/editor/abc?tab=pages", "/editor/abc?tab=pages"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["https://evil.example/phish"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["javascript:alert(1)"],
    ["board"],
  ])("falls back to /board for unsafe value %s", (input) => {
    expect(safeCallbackUrl(input)).toBe("/board");
  });

  it("uses a custom fallback", () => {
    expect(safeCallbackUrl("https://evil.example", "/signin")).toBe("/signin");
  });
});
