import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessCodeProblem,
  checkAccessCode,
  hashAccessCode,
  isUnlocked,
  signUnlock,
  UNLOCK_MAX_AGE_SECONDS,
  unlockCookieName,
} from "./zine-access";

// DIG-112: private zines open with a code the creator shares.
beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "unit-test-secret-that-is-at-least-32-characters");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("accessCodeProblem", () => {
  it("accepts a code of 6 to 64 characters", () => {
    expect(accessCodeProblem("harbor")).toBeNull();
    expect(accessCodeProblem("x".repeat(64))).toBeNull();
  });

  it("refuses a code that is too short, too long, or only spaces", () => {
    expect(accessCodeProblem("short")).toMatch(/at least 6/);
    expect(accessCodeProblem("x".repeat(65))).toMatch(/at most 64/);
    expect(accessCodeProblem("        ")).toMatch(/at least 6/);
  });

  it("refuses a code longer than bcrypt reads, so no part of it is silently ignored", () => {
    // 30 characters but 120 bytes: bcrypt would only compare the first 72 bytes.
    expect(accessCodeProblem("📷".repeat(30))).toMatch(/at most 64/);
  });
});

describe("hashAccessCode", () => {
  it("stores a hash, never the code, and only the same code matches it", async () => {
    const hash = await hashAccessCode("harbor-dusk");
    expect(hash).not.toContain("harbor-dusk");
    expect(await checkAccessCode("harbor-dusk", hash)).toBe(true);
    expect(await checkAccessCode("harbor-dawn", hash)).toBe(false);
  });

  it("ignores spaces around the code, as a reader pasting it would add them", async () => {
    const hash = await hashAccessCode("harbor-dusk");
    expect(await checkAccessCode("  harbor-dusk \n", hash)).toBe(true);
  });
});

describe("unlock cookie", () => {
  const now = Date.UTC(2026, 10, 26);

  it("opens the zine it was made for, at the code version it was made for", () => {
    const token = signUnlock("zine-a", 3, now);
    expect(isUnlocked(token, "zine-a", 3, now)).toBe(true);
  });

  it("does not open another zine", () => {
    expect(isUnlocked(signUnlock("zine-a", 3, now), "zine-b", 3, now)).toBe(false);
  });

  it("stops working once the code changes", () => {
    expect(isUnlocked(signUnlock("zine-a", 3, now), "zine-a", 4, now)).toBe(false);
  });

  it("stops working after 30 days", () => {
    const token = signUnlock("zine-a", 3, now);
    expect(isUnlocked(token, "zine-a", 3, now + (UNLOCK_MAX_AGE_SECONDS - 1) * 1000)).toBe(true);
    expect(isUnlocked(token, "zine-a", 3, now + (UNLOCK_MAX_AGE_SECONDS + 1) * 1000)).toBe(false);
  });

  it("refuses a token that was edited, made with another secret, or is missing", () => {
    const token = signUnlock("zine-a", 3, now);
    const [version, expires, mac] = token.split(".");
    expect(isUnlocked(`${version}.${Number(expires) + 999999}.${mac}`, "zine-a", 3, now)).toBe(false);
    expect(isUnlocked(`${version}.${expires}.${mac.slice(0, -2)}AA`, "zine-a", 3, now)).toBe(false);
    expect(isUnlocked("garbage", "zine-a", 3, now)).toBe(false);
    expect(isUnlocked(undefined, "zine-a", 3, now)).toBe(false);

    vi.stubEnv("AUTH_SECRET", "another-secret-that-is-also-at-least-32-characters");
    expect(isUnlocked(token, "zine-a", 3, now)).toBe(false);
  });

  it("names the cookie after the zine, so each zine has its own", () => {
    expect(unlockCookieName("zine-a")).not.toBe(unlockCookieName("zine-b"));
    expect(unlockCookieName("zine-a")).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
