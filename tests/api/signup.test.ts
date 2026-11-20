import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { EmailNotConfiguredError, sendVerificationEmail } from "@/lib/email";
import { POST as SIGNUP } from "@/app/api/signup/route";
import { POST as RESEND } from "@/app/api/signup/resend/route";
import { resetRateLimits } from "./helpers";

// DIG-94: creating an account with a password, and asking for the verification email again.
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendVerificationEmail: vi.fn(),
}));
const sendMock = vi.mocked(sendVerificationEmail);

const RUN = Date.now();
let counter = 0;
const newEmail = () => `signup-${RUN}-${counter++}@test.local`;
const created: string[] = [];

const body = (overrides: Record<string, unknown> = {}) => ({
  name: "Ada Lovelace",
  email: newEmail(),
  password: "correct-horse-9",
  confirmPassword: "correct-horse-9",
  acceptTerms: true,
  ...overrides,
});

const post = (handler: typeof SIGNUP, path: string, payload: unknown, ip = "203.0.113.10") =>
  handler(
    new Request(`http://test.local${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    })
  );
const signup = (payload: unknown, ip?: string) => post(SIGNUP, "/api/signup", payload, ip);
const resend = (payload: unknown, ip?: string) => post(RESEND, "/api/signup/resend", payload, ip);

/** The token in the link the mocked mailer was last asked to send. */
const sentToken = () => {
  const link = sendMock.mock.calls.at(-1)![1];
  return new URL(link).searchParams.get("token")!;
};

beforeEach(async () => {
  await resetRateLimits();
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: `signup-${RUN}-` } } });
  await prisma.$disconnect();
});

describe("POST /api/signup validation", () => {
  it.each([
    ["no name", { name: "  " }],
    ["a name over 80 characters", { name: "x".repeat(81) }],
    ["a malformed email", { email: "not-an-email" }],
    ["a password under 8 characters", { password: "short1", confirmPassword: "short1" }],
    ["a password over 72 characters (bcrypt ignores the rest)", { password: "a1".repeat(37), confirmPassword: "a1".repeat(37) }],
    ["a confirmation that does not match", { confirmPassword: "something-else-9" }],
    ["terms not accepted", { acceptTerms: false }],
    ["terms missing", { acceptTerms: undefined }],
  ])("returns 400 for %s and creates nothing", async (_label, overrides) => {
    const payload = body(overrides);
    const res = await signup(payload);
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
    expect(await prisma.user.count({ where: { email: payload.email.toLowerCase() } })).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not JSON", async () => {
    expect((await signup("{nope")).status).toBe(400);
  });

  it("rejects a password that is the creator's email", async () => {
    const email = newEmail();
    const res = await signup(body({ email, password: email, confirmPassword: email }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/signup", () => {
  it("creates an unverified account with a hashed password, then mails a link", async () => {
    const payload = body({ email: `  Mixed.Case-${RUN}@Test.Local ` });
    const res = await signup(payload);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: `mixed.case-${RUN}@test.local` } });
    created.push(user.id);
    expect(user.name).toBe("Ada Lovelace");
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.termsAcceptedAt).toBeInstanceOf(Date);
    expect(user.tier).toBe("free");
    expect(user.role).toBe("user");
    expect(user.passwordHash).not.toBe(payload.password);
    expect(await bcrypt.compare(payload.password, user.passwordHash!)).toBe(true);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toBe(user.email);
    expect(sendMock.mock.calls[0][1]).toMatch(/\/verify-email\?token=[\w-]{20,}$/);
  });

  it("stores only a hash of the token, never the token itself", async () => {
    await signup(body());
    const token = sentToken();
    const rows = await prisma.emailVerificationToken.findMany({ where: { tokenHash: token } });
    expect(rows).toHaveLength(0);
    const all = await prisma.emailVerificationToken.findMany({ where: { user: { email: { startsWith: `signup-${RUN}-` } } } });
    expect(all.length).toBeGreaterThan(0);
    for (const row of all) expect(row.tokenHash).not.toContain(token);
  });

  it("returns 409 for an email that already has an account, whatever its case, and sends nothing", async () => {
    const payload = body();
    expect((await signup(payload)).status).toBe(201);
    sendMock.mockClear();
    const again = await signup({ ...payload, email: payload.email.toUpperCase() });
    expect(again.status).toBe(409);
    expect(await prisma.user.count({ where: { email: payload.email.toLowerCase() } })).toBe(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not hand out or overwrite anything for a Google-only account that owns the email", async () => {
    const email = newEmail();
    await prisma.user.create({ data: { email, googleId: `g-${RUN}`, emailVerifiedAt: new Date() } });
    const res = await signup(body({ email }));
    expect(res.status).toBe(409);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toBeNull();
  });

  it("returns 503 and leaves no account behind when email cannot be sent", async () => {
    sendMock.mockRejectedValue(new EmailNotConfiguredError());
    const payload = body();
    const res = await signup(payload);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/email/i);
    expect(await prisma.user.count({ where: { email: payload.email.toLowerCase() } })).toBe(0);
  });

  it("returns 429 after 10 signups an hour from one IP", async () => {
    for (let i = 0; i < 10; i++) expect((await signup(body(), "198.51.100.7")).status).toBe(201);
    const res = await signup(body(), "198.51.100.7");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    // Another IP is unaffected.
    expect((await signup(body(), "198.51.100.8")).status).toBe(201);
  });
});

describe("POST /api/signup/resend", () => {
  it("mails a fresh link to an unverified account and retires the old one", async () => {
    const payload = body();
    await signup(payload);
    const first = sentToken();
    sendMock.mockClear();

    const res = await resend({ email: payload.email });
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentToken()).not.toBe(first);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: payload.email.toLowerCase() } });
    expect(await prisma.emailVerificationToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it.each([
    ["an email with no account", async () => ({ email: newEmail() })],
    [
      "a verified account",
      async () => {
        const email = newEmail();
        await prisma.user.create({ data: { email, passwordHash: "x", emailVerifiedAt: new Date() } });
        return { email };
      },
    ],
    [
      "a Google-only account",
      async () => {
        const email = newEmail();
        await prisma.user.create({ data: { email, googleId: `g-${RUN}-r`, emailVerifiedAt: new Date() } });
        return { email };
      },
    ],
  ])("answers 200 the same way for %s and sends nothing", async (_label, arrange) => {
    const res = await resend(await arrange());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed email", async () => {
    expect((await resend({ email: "nope" })).status).toBe(400);
  });

  it("returns 429 after 3 requests an hour for one email", async () => {
    const payload = body();
    await signup(payload);
    for (let i = 0; i < 3; i++) expect((await resend({ email: payload.email }, `192.0.2.${i}`)).status).toBe(200);
    expect((await resend({ email: payload.email }, "192.0.2.99")).status).toBe(429);
  });
});
