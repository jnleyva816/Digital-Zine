import { describe, expect, it } from "vitest";
import { isRecentSignIn, REAUTH_WINDOW_MS } from "./account-deletion";

// DIG-108: deleting an account needs a sign-in from the last five minutes, or the password.
describe("isRecentSignIn", () => {
  const now = Date.UTC(2026, 10, 20, 18, 0, 0);

  it("accepts a sign-in from the last five minutes", () => {
    expect(REAUTH_WINDOW_MS).toBe(5 * 60 * 1000);
    expect(isRecentSignIn(now, now)).toBe(true);
    expect(isRecentSignIn(now - 4 * 60_000, now)).toBe(true);
    expect(isRecentSignIn(now - REAUTH_WINDOW_MS, now)).toBe(true);
  });

  it("refuses an older one", () => {
    expect(isRecentSignIn(now - REAUTH_WINDOW_MS - 1, now)).toBe(false);
    expect(isRecentSignIn(now - 60 * 60_000, now)).toBe(false);
  });

  it("refuses a session with no start time, and a start time in the future", () => {
    for (const bad of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, "123" as unknown as number]) {
      expect(isRecentSignIn(bad, now)).toBe(false);
    }
    expect(isRecentSignIn(now + 60_000, now)).toBe(false);
  });
});
