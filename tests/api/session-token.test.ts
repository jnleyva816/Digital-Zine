import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkSessionToken, isSessionRevoked, markSignedIn } from "@/lib/auth/session-token";
import { createTestUser, deleteTestUser } from "./helpers";

// DIG-107: a password reset signs out every session issued before it.
const T = new Date("2026-11-20T18:00:00.000Z");

describe("isSessionRevoked", () => {
  it("never revokes while no reset has happened", () => {
    for (const authAt of [undefined, 0, 1, Date.now(), "nope"]) expect(isSessionRevoked(authAt, null)).toBe(false);
  });

  it("revokes a session issued before the reset, and keeps one issued at or after it", () => {
    expect(isSessionRevoked(T.getTime() - 1, T)).toBe(true);
    expect(isSessionRevoked(T.getTime(), T)).toBe(false);
    expect(isSessionRevoked(T.getTime() + 1, T)).toBe(false);
  });

  it("revokes a session with no usable issue time, such as one from before this check existed", () => {
    for (const authAt of [undefined, null, "123", Number.NaN, -1, {}]) expect(isSessionRevoked(authAt, T)).toBe(true);
  });
});

describe("markSignedIn", () => {
  it("records when the session began", () => {
    const before = Date.now();
    const token = markSignedIn({ sub: "u1" });
    expect(token.authAt).toBeGreaterThanOrEqual(before);
    expect(token.authAt).toBeLessThanOrEqual(Date.now());
    expect(token.sub).toBe("u1");
  });
});

describe("checkSessionToken", () => {
  let userId: string;
  beforeAll(async () => {
    userId = (await createTestUser()).id;
  });
  afterAll(async () => {
    await deleteTestUser(userId);
    await prisma.$disconnect();
  });
  const setValidAfter = (value: Date | null) => prisma.user.update({ where: { id: userId }, data: { sessionsValidAfter: value } });

  it("keeps every session of an account that never reset its password", async () => {
    await setValidAfter(null);
    const token = { sub: userId, authAt: 1 };
    expect(await checkSessionToken(token)).toBe(token);
    const legacy = { sub: userId };
    expect(await checkSessionToken(legacy)).toBe(legacy);
  });

  it("signs out sessions issued before the reset and keeps newer ones", async () => {
    await setValidAfter(T);
    expect(await checkSessionToken({ sub: userId, authAt: T.getTime() - 5_000 })).toBeNull();
    expect(await checkSessionToken({ sub: userId })).toBeNull();
    const fresh = { sub: userId, authAt: T.getTime() + 5_000 };
    expect(await checkSessionToken(fresh)).toBe(fresh);
  });

  it("signs out a session whose account no longer exists", async () => {
    expect(await checkSessionToken({ sub: "no-such-user", authAt: Date.now() })).toBeNull();
  });

  it("passes a token with no account through, for the session callback to handle", async () => {
    const token = { authAt: 1 };
    expect(await checkSessionToken(token)).toBe(token);
  });
});
