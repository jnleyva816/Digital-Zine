import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveGoogleUser } from "@/lib/google-signin";

// DIG-94: turning a Google profile into one of our accounts.
const RUN = Date.now();
let n = 0;
const email = () => `google-${RUN}-${n++}@test.local`;
const profile = (over: Record<string, unknown> = {}) => ({
  sub: `sub-${RUN}-${n++}`,
  email: email(),
  email_verified: true,
  name: "Grace Hopper",
  ...over,
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: `google-${RUN}-` } } });
  await prisma.$disconnect();
});

describe("resolveGoogleUser", () => {
  it("creates a verified Free account with no password for a new Google user", async () => {
    const p = profile({ email: `Google-${RUN}-New@Test.Local` });
    const result = await resolveGoogleUser(p);
    expect(result.ok).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `google-${RUN}-new@test.local` } });
    expect(result).toEqual({ ok: true, userId: user.id });
    expect(user).toMatchObject({ googleId: p.sub, name: "Grace Hopper", passwordHash: null, tier: "free", role: "user" });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("returns the same account on the next sign-in", async () => {
    const p = profile();
    const first = await resolveGoogleUser(p);
    expect(await resolveGoogleUser(p)).toEqual(first);
    expect(await prisma.user.count({ where: { googleId: p.sub } })).toBe(1);
  });

  it("follows the Google account if its email changes", async () => {
    const p = profile();
    const first = await resolveGoogleUser(p);
    expect(await resolveGoogleUser({ ...p, email: email() })).toEqual(first);
  });

  it("links a verified Google email to the password account that owns it", async () => {
    const p = profile();
    const existing = await prisma.user.create({
      data: { email: p.email, name: "Kept Name", passwordHash: "hash", emailVerifiedAt: new Date(), tier: "pro" },
    });
    expect(await resolveGoogleUser(p)).toEqual({ ok: true, userId: existing.id });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(after).toMatchObject({ googleId: p.sub, passwordHash: "hash", name: "Kept Name", tier: "pro" });
  });

  it("verifies a password account that signed up but never clicked its link", async () => {
    const p = profile();
    const existing = await prisma.user.create({ data: { email: p.email, passwordHash: "hash" } });
    await resolveGoogleUser(p);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("refuses an email Google has not verified, and never links or creates", async () => {
    const taken = profile({ email_verified: false });
    const victim = await prisma.user.create({ data: { email: taken.email, passwordHash: "hash", emailVerifiedAt: new Date() } });
    expect(await resolveGoogleUser(taken)).toEqual({ ok: false, reason: "unverified_email" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).googleId).toBeNull();

    const fresh = profile({ email_verified: false });
    expect(await resolveGoogleUser(fresh)).toEqual({ ok: false, reason: "unverified_email" });
    expect(await prisma.user.count({ where: { email: fresh.email } })).toBe(0);
  });

  it.each([
    ["no email", { email: undefined }],
    ["an empty email", { email: "" }],
    ["no sub", { sub: undefined }],
  ])("refuses a profile with %s", async (_label, over) => {
    expect((await resolveGoogleUser(profile(over))).ok).toBe(false);
  });

  it("does not take over an account already linked to a different Google account", async () => {
    const p = profile();
    const owner = await prisma.user.create({ data: { email: p.email, googleId: `other-${RUN}`, emailVerifiedAt: new Date() } });
    expect(await resolveGoogleUser(p)).toEqual({ ok: false, reason: "email_linked_elsewhere" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).googleId).toBe(`other-${RUN}`);
  });
});
