import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { consumeVerificationToken, issueVerificationToken, verificationLink } from "@/lib/email-verification";
import { createTestUser, deleteTestUser } from "./helpers";

// DIG-94: single-use, expiring links that prove the creator owns the email.
let userId: string;

beforeAll(async () => {
  userId = (await createTestUser()).id;
});
afterAll(async () => {
  await deleteTestUser(userId);
  await prisma.$disconnect();
});

const unverify = () => prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: null } });

describe("verification tokens", () => {
  it("verifies the account once, then refuses the same token", async () => {
    await unverify();
    const token = await issueVerificationToken(userId);
    const user = await consumeVerificationToken(token);
    expect(user).toMatchObject({ id: userId });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).toBeInstanceOf(Date);
    expect(await consumeVerificationToken(token)).toBeNull();
  });

  it("refuses an unknown or empty token", async () => {
    expect(await consumeVerificationToken("not-a-real-token")).toBeNull();
    expect(await consumeVerificationToken("")).toBeNull();
  });

  it("refuses an expired token and does not verify the account", async () => {
    await unverify();
    const token = await issueVerificationToken(userId);
    await prisma.emailVerificationToken.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumeVerificationToken(token)).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).toBeNull();
  });

  it("expires a token after 24 hours", async () => {
    const before = Date.now();
    await issueVerificationToken(userId);
    const row = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId } });
    const ttl = row.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(23.9 * 3600_000);
    expect(ttl).toBeLessThan(24.1 * 3600_000);
  });

  it("retires the older token when a new one is issued", async () => {
    await unverify();
    const first = await issueVerificationToken(userId);
    const second = await issueVerificationToken(userId);
    expect(await consumeVerificationToken(first)).toBeNull();
    expect(await consumeVerificationToken(second)).toMatchObject({ id: userId });
  });

  it("lets only one of two simultaneous uses of a token win", async () => {
    await unverify();
    const token = await issueVerificationToken(userId);
    const results = await Promise.all([consumeVerificationToken(token), consumeVerificationToken(token)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("builds the link from NEXT_PUBLIC_APP_URL only", () => {
    expect(verificationLink("abc")).toBe(`${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=abc`);
    expect(verificationLink("a b&c")).toContain("token=a%20b%26c");
  });
});
