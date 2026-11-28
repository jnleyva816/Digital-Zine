import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { EmailNotVerifiedError, authorizeCredentials } from "@/lib/auth/sign-in";
import { resetRateLimits } from "./helpers";

// DIG-94: password sign-in needs a verified email, and Google-only accounts have no password.
const RUN = Date.now();
const req = new Request("http://test.local/api/auth/callback/credentials", { headers: { "x-forwarded-for": "203.0.113.50" } });
const unverified = `unverified-${RUN}@test.local`;
const googleOnly = `google-only-${RUN}@test.local`;

beforeAll(async () => {
  await prisma.user.create({ data: { email: unverified, passwordHash: await bcrypt.hash("right-pass-1", 4) } });
  await prisma.user.create({ data: { email: googleOnly, googleId: `sub-${RUN}`, emailVerifiedAt: new Date() } });
});
beforeEach(resetRateLimits);
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [unverified, googleOnly] } } });
  await prisma.$disconnect();
});

describe("sign-in and verification", () => {
  it("tells an unverified creator with the right password to verify their email", async () => {
    await expect(authorizeCredentials({ email: unverified, password: "right-pass-1" }, req)).rejects.toBeInstanceOf(EmailNotVerifiedError);
  });

  it("does not reveal that an account is unverified to someone with the wrong password", async () => {
    expect(await authorizeCredentials({ email: unverified, password: "wrong-pass-1" }, req)).toBeNull();
  });

  it("counts the wrong-password tries against the rate limit as usual", async () => {
    for (let i = 0; i < 5; i++) await authorizeCredentials({ email: unverified, password: "wrong-pass-1" }, req);
    await expect(authorizeCredentials({ email: unverified, password: "right-pass-1" }, req)).rejects.toThrow();
    await expect(authorizeCredentials({ email: unverified, password: "right-pass-1" }, req)).rejects.not.toBeInstanceOf(EmailNotVerifiedError);
  });

  it("signs in once the email is verified", async () => {
    await prisma.user.update({ where: { email: unverified }, data: { emailVerifiedAt: new Date() } });
    expect(await authorizeCredentials({ email: unverified, password: "right-pass-1" }, req)).toMatchObject({ email: unverified });
    await prisma.user.update({ where: { email: unverified }, data: { emailVerifiedAt: null } });
  });

  it("refuses any password for a Google-only account", async () => {
    expect(await authorizeCredentials({ email: googleOnly, password: "" }, req)).toBeNull();
    expect(await authorizeCredentials({ email: googleOnly, password: "null" }, req)).toBeNull();
    expect(await authorizeCredentials({ email: googleOnly, password: "undefined" }, req)).toBeNull();
  });
});
