import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendGoogleSignInReminderEmail, sendPasswordResetEmail } from "@/lib/infra/email";
import { issueVerificationToken } from "@/lib/auth/email-verification";
import { issueResetToken, RESET_TTL_MS } from "@/lib/auth/password-reset";
import { POST as FORGOT } from "@/app/api/password/forgot/route";
import { POST as RESET } from "@/app/api/password/reset/route";
import { resetRateLimits, settleAfter } from "./helpers";

// DIG-107: forgot password. A request that never says who has an account, and a reset that works once.
vi.mock("@/lib/infra/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/infra/email")>()),
  sendPasswordResetEmail: vi.fn(),
  sendGoogleSignInReminderEmail: vi.fn(),
}));
const resetMail = vi.mocked(sendPasswordResetEmail);
const googleMail = vi.mocked(sendGoogleSignInReminderEmail);

const SITE = "https://zine.test";
const RUN = Date.now();
let counter = 0;
const newEmail = () => `reset-${RUN}-${counter++}@test.local`;
const OLD_PASSWORD = "old-password-1";
const NEW_PASSWORD = "brand-new-pass-9";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function makeUser(
  kind: "password" | "google" | "unverified" = "password"
): Promise<{ id: string; email: string }> {
  const email = newEmail();
  const user = await prisma.user.create({
    data: {
      email,
      name: "Reset Test",
      passwordHash: kind === "google" ? null : await bcrypt.hash(OLD_PASSWORD, 4),
      googleId: kind === "google" ? `g-${email}` : null,
      emailVerifiedAt: kind === "unverified" ? null : new Date(),
    },
  });
  return { id: user.id, email };
}

const post = (handler: typeof FORGOT, path: string, payload: unknown, ip = "203.0.113.10") =>
  handler(
    new Request(`http://test.local${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    })
  );
const forgot = (payload: unknown, ip?: string) => post(FORGOT, "/api/password/forgot", payload, ip);
const reset = (payload: unknown, ip?: string) => post(RESET, "/api/password/reset", payload, ip);
const resetBody = (token: string, overrides: Record<string, unknown> = {}) => ({
  token,
  password: NEW_PASSWORD,
  confirmPassword: NEW_PASSWORD,
  ...overrides,
});

/** The token in the link the mocked mailer was last asked to send. */
const sentToken = () => new URL(resetMail.mock.calls.at(-1)![1]).searchParams.get("token")!;
const passwordIs = async (userId: string, password: string) =>
  bcrypt.compare(password, (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash!);

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", SITE);
  await resetRateLimits();
  resetMail.mockReset();
  resetMail.mockResolvedValue(undefined);
  googleMail.mockReset();
  googleMail.mockResolvedValue(undefined);
  await settleAfter();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma.user.deleteMany({ where: { email: { startsWith: `reset-${RUN}-` } } });
  await prisma.$disconnect();
});

describe("POST /api/password/forgot", () => {
  it("answers the same for an account with a password, a Google-only account, and an address nobody has", async () => {
    const withPassword = await makeUser("password");
    const googleOnly = await makeUser("google");
    const answers = [];
    for (const email of [withPassword.email, googleOnly.email, newEmail()]) {
      const res = await forgot({ email });
      answers.push({ status: res.status, body: await res.json() });
    }
    await settleAfter();
    expect(answers).toEqual([
      { status: 200, body: { ok: true } },
      { status: 200, body: { ok: true } },
      { status: 200, body: { ok: true } },
    ]);
  });

  it("mails a reset link to an account with a password, valid for one hour, stored only as a hash", async () => {
    const user = await makeUser();
    const before = Date.now();
    await forgot({ email: user.email });
    await settleAfter();

    expect(resetMail).toHaveBeenCalledTimes(1);
    expect(resetMail.mock.calls[0][0]).toBe(user.email);
    const link = new URL(resetMail.mock.calls[0][1]);
    expect(`${link.origin}${link.pathname}`).toBe(`${SITE}/reset-password`);
    const token = link.searchParams.get("token")!;
    expect(token.length).toBeGreaterThanOrEqual(40);

    const row = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.tokenHash).toBe(sha256(token));
    expect(row.tokenHash).not.toContain(token);
    expect(row.expiresAt.getTime() - before).toBeGreaterThan(RESET_TTL_MS - 60_000);
    expect(row.expiresAt.getTime() - before).toBeLessThan(RESET_TTL_MS + 60_000);
    expect(RESET_TTL_MS).toBe(60 * 60 * 1000);
    expect(googleMail).not.toHaveBeenCalled();
  });

  it("tells a Google-only account to sign in with Google, with no reset link and no token", async () => {
    const user = await makeUser("google");
    await forgot({ email: user.email });
    await settleAfter();
    expect(googleMail).toHaveBeenCalledWith(user.email, `${SITE}/signin`);
    expect(resetMail).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it("sends nothing and stores nothing for an address nobody has", async () => {
    const before = await prisma.passwordResetToken.count();
    await forgot({ email: newEmail() });
    await settleAfter();
    expect(resetMail).not.toHaveBeenCalled();
    expect(googleMail).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count()).toBe(before);
  });

  it("finds the account whatever the case or spacing of the address", async () => {
    const user = await makeUser();
    await forgot({ email: `  ${user.email.toUpperCase()} ` });
    await settleAfter();
    expect(resetMail).toHaveBeenCalledWith(user.email, expect.any(String));
  });

  it("lets an account that never verified its email reset, since the link proves it owns the address", async () => {
    const user = await makeUser("unverified");
    await forgot({ email: user.email });
    await settleAfter();
    expect(resetMail).toHaveBeenCalledTimes(1);
  });

  it("retires the older link when a newer one is asked for", async () => {
    const user = await makeUser();
    await forgot({ email: user.email });
    await settleAfter();
    const first = sentToken();
    await forgot({ email: user.email });
    await settleAfter();
    const second = sentToken();
    expect(second).not.toBe(first);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

    expect((await reset(resetBody(first))).status).toBe(400);
    expect((await reset(resetBody(second))).status).toBe(200);
  });

  it("does not wait for the email, so a slow mailer cannot tell a stranger which addresses have accounts", async () => {
    const user = await makeUser();
    resetMail.mockReturnValue(new Promise(() => undefined));
    const timedOut = Symbol("timed out");
    const answer = await Promise.race([forgot({ email: user.email }), new Promise((r) => setTimeout(() => r(timedOut), 3_000))]);
    expect(answer).not.toBe(timedOut);
    expect((answer as Response).status).toBe(200);
  });

  it("still answers the same when the mailer fails, and logs why", async () => {
    const user = await makeUser();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    resetMail.mockRejectedValue(new Error("Resend rejected the email (422): nope"));
    const res = await forgot({ email: user.email });
    await settleAfter();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(logged).toHaveBeenCalledWith("Password reset email failed", expect.any(Error));
    logged.mockRestore();
  });

  it.each([
    ["not JSON", "{"],
    ["no email", {}],
    ["an invalid email", { email: "nope" }],
    ["an email that is too long", { email: `${"a".repeat(250)}@b.co` }],
  ])("refuses %s with 400", async (_label, payload) => {
    const res = await forgot(payload);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid email/i);
    await settleAfter();
    expect(resetMail).not.toHaveBeenCalled();
  });

  it("allows 3 requests an hour for one address, even from different networks, and then says to wait", async () => {
    const user = await makeUser();
    for (let i = 0; i < 3; i++) expect((await forgot({ email: user.email }, `198.51.100.${i + 1}`)).status).toBe(200);
    const blocked = await forgot({ email: user.email }, "198.51.100.99");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe("rate_limited");
    expect(blocked.headers.get("Retry-After")).toMatch(/^\d+$/);
    await settleAfter();
    expect(resetMail).toHaveBeenCalledTimes(3);
  });

  it("limits an address nobody has in exactly the same way", async () => {
    const email = newEmail();
    for (let i = 0; i < 3; i++) expect((await forgot({ email })).status).toBe(200);
    expect((await forgot({ email })).status).toBe(429);
  });

  it("allows 20 requests an hour from one network, across different addresses, and then says to wait", async () => {
    for (let i = 0; i < 20; i++) expect((await forgot({ email: newEmail() }, "192.0.2.50")).status).toBe(200);
    expect((await forgot({ email: newEmail() }, "192.0.2.50")).status).toBe(429);
    expect((await forgot({ email: newEmail() }, "192.0.2.51")).status).toBe(200);
  });
});

describe("POST /api/password/reset", () => {
  it("changes the password, spends the link, and returns the email so the page can sign the creator in", async () => {
    const user = await makeUser();
    const token = await issueResetToken(user.id);
    const res = await reset(resetBody(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: user.email });
    expect(await passwordIs(user.id, NEW_PASSWORD)).toBe(true);
    expect(await passwordIs(user.id, OLD_PASSWORD)).toBe(false);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it("works once: the same link is refused the second time and the password does not change again", async () => {
    const user = await makeUser();
    const token = await issueResetToken(user.id);
    expect((await reset(resetBody(token))).status).toBe(200);
    const again = await reset(resetBody(token, { password: "another-pass-77", confirmPassword: "another-pass-77" }));
    expect(again.status).toBe(400);
    expect(await passwordIs(user.id, NEW_PASSWORD)).toBe(true);
  });

  it("gives an unknown, used, and expired link exactly the same answer", async () => {
    const user = await makeUser();
    const used = await issueResetToken(user.id);
    await reset(resetBody(used));
    const expired = await issueResetToken(user.id);
    await prisma.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const answers = [];
    for (const token of ["not-a-real-token", used, expired, "", "x".repeat(500)]) {
      const res = await reset(resetBody(token));
      answers.push({ status: res.status, body: await res.json() });
    }
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(answers[0].status).toBe(400);
    expect(answers[0].body).toEqual({ error: "This link is expired or already used. Ask for a new one.", code: "invalid_token" });
    expect(await passwordIs(user.id, OLD_PASSWORD)).toBe(false);
    expect(await passwordIs(user.id, NEW_PASSWORD)).toBe(true);
  });

  it("does not change the password for an expired link", async () => {
    const user = await makeUser();
    const token = await issueResetToken(user.id);
    await prisma.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await reset(resetBody(token))).status).toBe(400);
    expect(await passwordIs(user.id, OLD_PASSWORD)).toBe(true);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it.each([
    ["a password under 8 characters", { password: "short1", confirmPassword: "short1" }, /at least 8/i],
    ["a password over 72 characters", { password: "a".repeat(73), confirmPassword: "a".repeat(73) }, /at most 72/i],
    ["a confirmation that does not match", { confirmPassword: "different-pass-1" }, /do not match/i],
    ["no password", { password: undefined, confirmPassword: undefined }, /choose a password/i],
  ])("refuses %s with 400 and keeps the link good", async (_label, overrides, message) => {
    const user = await makeUser();
    const token = await issueResetToken(user.id);
    const res = await reset(resetBody(token, overrides));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(message);
    expect(await passwordIs(user.id, OLD_PASSWORD)).toBe(true);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
    expect((await reset(resetBody(token))).status).toBe(200);
  });

  it("refuses the creator's own email as the password, and keeps the link good", async () => {
    const user = await makeUser();
    const token = await issueResetToken(user.id);
    const res = await reset(resetBody(token, { password: user.email, confirmPassword: user.email }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email as your password/i);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it("refuses a body that is not JSON", async () => {
    expect((await reset("{")).status).toBe(400);
  });

  it("marks the email verified, because the link proved the creator owns it", async () => {
    const user = await makeUser("unverified");
    await issueVerificationToken(user.id);
    const token = await issueResetToken(user.id);
    expect((await reset(resetBody(token))).status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await prisma.emailVerificationToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it("keeps an email's earlier verification date", async () => {
    const user = await makeUser();
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: verifiedAt } });
    await reset(resetBody(await issueResetToken(user.id)));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toEqual(verifiedAt);
  });

  it("signs out every session issued before the reset", async () => {
    const user = await makeUser();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionsValidAfter).toBeNull();
    const before = Date.now();
    await reset(resetBody(await issueResetToken(user.id)));
    const { sessionsValidAfter } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(sessionsValidAfter!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(sessionsValidAfter!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("retires every other reset link for the account", async () => {
    const user = await makeUser();
    const token = await issueResetToken(user.id);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(`extra-${user.id}`), expiresAt: new Date(Date.now() + 60_000) },
    });
    await reset(resetBody(token));
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it("lets only one of two simultaneous submissions of the same link win", async () => {
    const user = await makeUser();
    const token = await issueResetToken(user.id);
    const [a, b] = await Promise.all([
      reset(resetBody(token, { password: "winner-one-123", confirmPassword: "winner-one-123" })),
      reset(resetBody(token, { password: "winner-two-456", confirmPassword: "winner-two-456" })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    const winner = a.status === 200 ? "winner-one-123" : "winner-two-456";
    expect(await passwordIs(user.id, winner)).toBe(true);
  });

  it("counts attempts per network: 20 an hour, then refuses even a good link, which stays unspent", async () => {
    const user = await makeUser();
    const token = await issueResetToken(user.id);
    for (let i = 0; i < 20; i++) expect((await reset(resetBody(`wrong-${i}`), "192.0.2.77")).status).toBe(400);
    const blocked = await reset(resetBody(token), "192.0.2.77");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe("rate_limited");
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
    expect((await reset(resetBody(token), "192.0.2.78")).status).toBe(200);
  });

  it("stores the new password as a bcrypt hash, never as given", async () => {
    const user = await makeUser();
    await reset(resetBody(await issueResetToken(user.id)));
    const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
    expect(passwordHash).not.toContain(NEW_PASSWORD);
  });
});
