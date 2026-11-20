import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { RATE_LIMITS, consumeRateLimit, rateLimitKey, type RateLimitRule } from "@/lib/rate-limit";
import { SignInRateLimitedError, authorizeCredentials, clientIp } from "@/lib/sign-in";
import { POST as PRESIGN } from "@/app/api/uploads/presign/route";
import { POST as CREATE_ASSET } from "@/app/api/assets/route";
import { DELETE as DELETE_ASSET, PATCH as PATCH_ASSET } from "@/app/api/assets/[id]/route";
import { POST as REORDER_ASSETS } from "@/app/api/assets/reorder/route";
import { POST as RETRY_ASSET } from "@/app/api/assets/[id]/process/route";
import { POST as CREATE_ZINE } from "@/app/api/zines/route";
import { DELETE as DELETE_ZINE, PATCH as PATCH_ZINE } from "@/app/api/zines/[id]/route";
import { POST as CREATE_BOARD } from "@/app/api/boards/route";
import { DELETE as DELETE_BOARD, PATCH as PATCH_BOARD } from "@/app/api/boards/[id]/route";
import { POST as REORDER_BOARDS } from "@/app/api/boards/reorder/route";
import { POST as CREATE_RECIPE } from "@/app/api/recipes/route";
import { DELETE as DELETE_RECIPE, PATCH as PATCH_RECIPE } from "@/app/api/recipes/[id]/route";
import { GET as PDF } from "@/app/api/pdf/[slug]/route";
import { createTestUser, deleteTestUser, jsonRequest, params } from "./helpers";

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

let me: Awaited<ReturnType<typeof createTestUser>>;

beforeAll(async () => {
  me = await createTestUser();
});

afterAll(async () => {
  await deleteTestUser(me.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  mockedUser.mockResolvedValue({ ...me, tier: "pro" });
  await prisma.rateLimit.deleteMany({});
});

afterEach(() => {
  vi.useRealTimers();
});

/** Puts a counter right at its limit, as if the window's requests had already been made. */
async function atLimit(rule: RateLimitRule, id: string) {
  await prisma.rateLimit.create({
    data: { key: rateLimitKey(rule, id), count: RATE_LIMITS[rule].limit, windowStart: new Date() },
  });
}

async function expectRateLimited(res: Response, message: RegExp) {
  expect(res.status).toBe(429);
  expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  const body = (await res.json()) as { error: string; code: string };
  expect(body.code).toBe("rate_limited");
  expect(body.error).toMatch(message);
}

describe("the decided limits (DIG-28)", () => {
  it("are balanced: sign-in 5 per email and 20 per IP per 15 min, sign-up 10/h per IP, resend 3/h per email and 20/h per IP, uploads 300/h, writes 120/min, PDF 10/h", () => {
    expect(RATE_LIMITS).toEqual({
      "signin-email": { limit: 5, windowSeconds: 900 },
      "signin-ip": { limit: 20, windowSeconds: 900 },
      "signup-ip": { limit: 10, windowSeconds: 3600 },
      "resend-email": { limit: 3, windowSeconds: 3600 },
      "resend-ip": { limit: 20, windowSeconds: 3600 },
      // DIG-107: password reset requests per email and per IP, and attempts to use a link per IP.
      "forgot-email": { limit: 3, windowSeconds: 3600 },
      "forgot-ip": { limit: 20, windowSeconds: 3600 },
      "reset-ip": { limit: 20, windowSeconds: 3600 },
      // DIG-108: attempts to delete an account, per creator.
      "account-delete": { limit: 5, windowSeconds: 3600 },
      "csp-report": { limit: 60, windowSeconds: 60 },
      upload: { limit: 300, windowSeconds: 3600 },
      write: { limit: 120, windowSeconds: 60 },
      pdf: { limit: 10, windowSeconds: 3600 },
    });
  });
});

describe("consumeRateLimit", () => {
  it("allows requests up to the limit, refuses the next with the time left, and resets after the window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
    for (let i = 0; i < 10; i++) expect((await consumeRateLimit("pdf", "u1")).ok).toBe(true);
    vi.setSystemTime(new Date("2026-11-19T12:30:00Z"));
    expect(await consumeRateLimit("pdf", "u1")).toEqual({ ok: false, retryAfterSeconds: 1800 });
    // Another user, or another rule, has its own counter.
    expect((await consumeRateLimit("pdf", "u2")).ok).toBe(true);
    expect((await consumeRateLimit("write", "u1")).ok).toBe(true);
    vi.setSystemTime(new Date("2026-11-19T13:00:01Z"));
    expect((await consumeRateLimit("pdf", "u1")).ok).toBe(true);
  });

  it("counts every one of many simultaneous requests", async () => {
    await Promise.all(Array.from({ length: 25 }, () => consumeRateLimit("write", "burst")));
    expect((await prisma.rateLimit.findUniqueOrThrow({ where: { key: rateLimitKey("write", "burst") } })).count).toBe(25);
  });
});

describe("routes over their limit return 429 with Retry-After and a message", () => {
  it("refuses an upload past 300 an hour", async () => {
    await atLimit("upload", me.id);
    const res = await PRESIGN(jsonRequest("/api/uploads/presign", "POST", { filename: "a.jpg", contentType: "image/jpeg", size: 10 }));
    await expectRateLimited(res, /uploads/i);
  });

  it("refuses a PDF export past 10 an hour", async () => {
    await atLimit("pdf", me.id);
    await expectRateLimited(await PDF(new Request("http://test.local/api/pdf/x"), params({ slug: "x" })), /PDF/);
  });

  it("refuses every kind of write past 120 a minute", async () => {
    await atLimit("write", me.id);
    const id = params({ id: "x" });
    const writes: [string, Promise<Response>][] = [
      ["create photo", CREATE_ASSET(jsonRequest("/api/assets", "POST", { storageKey: `users/${me.id}/x.jpg` }))],
      ["edit photo", PATCH_ASSET(jsonRequest("/", "PATCH", { name: "x" }), id)],
      ["delete photo", DELETE_ASSET(jsonRequest("/", "DELETE"), id)],
      ["reorder photos", REORDER_ASSETS(jsonRequest("/", "POST", { orderedIds: ["x"] }))],
      ["retry processing", RETRY_ASSET(jsonRequest("/", "POST"), id)],
      ["create zine", CREATE_ZINE(jsonRequest("/", "POST", { title: "x" }))],
      ["edit zine", PATCH_ZINE(jsonRequest("/", "PATCH", { title: "x" }), id)],
      ["delete zine", DELETE_ZINE(jsonRequest("/", "DELETE"), id)],
      ["create board", CREATE_BOARD(jsonRequest("/", "POST", { name: "x" }))],
      ["rename board", PATCH_BOARD(jsonRequest("/", "PATCH", { name: "x" }), id)],
      ["delete board", DELETE_BOARD(jsonRequest("/", "DELETE"), id)],
      ["reorder boards", REORDER_BOARDS(jsonRequest("/", "POST", { orderedIds: ["x"] }))],
      ["create recipe", CREATE_RECIPE(jsonRequest("/", "POST", { recipe: { name: "x", filmSimulation: "Acros" } }))],
      ["edit recipe", PATCH_RECIPE(jsonRequest("/", "PATCH", { recipe: { name: "x", filmSimulation: "Acros" } }), id)],
      ["delete recipe", DELETE_RECIPE(jsonRequest("/", "DELETE"), id)],
    ];
    for (const [name, pending] of writes) {
      const res = await pending;
      expect(res.status, name).toBe(429);
      expect(((await res.json()) as { code: string }).code, name).toBe("rate_limited");
    }
  });

  it("still lets a user under the limit write, and counts each write", async () => {
    const res = await CREATE_BOARD(jsonRequest("/", "POST", { name: `Under ${Date.now()}` }));
    expect(res.status).toBe(201);
    expect((await prisma.rateLimit.findUniqueOrThrow({ where: { key: rateLimitKey("write", me.id) } })).count).toBe(1);
  });

  it("checks sign-in before limits, so signed-out requests still get 401", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await CREATE_BOARD(jsonRequest("/", "POST", { name: "x" }))).status).toBe(401);
  });
});

describe("sign-in attempts", () => {
  const email = `limit-${Date.now()}@test.local`;
  /**
   * A request as our proxy forwards it: the proxy appends the address that connected to it, so
   * the real client is the rightmost entry. Anything to its left came from the client and may be
   * forged (DIG-37).
   */
  const fromIp = (ip: string, forged = "6.6.6.6") =>
    new Request("http://test.local/api/auth/callback/credentials", { headers: { "x-forwarded-for": `${forged}, ${ip}` } });

  beforeAll(async () => {
    await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash("right-pass", 4), emailVerifiedAt: new Date() } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
  });

  it("reads the client IP from the right of X-Forwarded-For, past the configured number of proxies (DIG-37)", () => {
    expect(clientIp(fromIp("203.0.113.9"))).toBe("203.0.113.9");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    const twoProxies = new Request("http://x", { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" } });
    expect(clientIp(twoProxies)).toBe("203.0.113.9");
    vi.unstubAllEnvs();
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });

  it("signs in with the right password", async () => {
    expect(await authorizeCredentials({ email, password: "right-pass" }, fromIp("203.0.113.1"))).toMatchObject({ email });
  });

  it("does not let an attacker lock a creator out: failures count per email and IP together (DIG-37)", async () => {
    for (let i = 0; i < 5; i++) expect(await authorizeCredentials({ email, password: "wrong" }, fromIp("198.51.100.66"))).toBeNull();
    // The attacker's IP is now blocked for this email, even with the right password…
    await expect(authorizeCredentials({ email, password: "right-pass" }, fromIp("198.51.100.66"))).rejects.toBeInstanceOf(
      SignInRateLimitedError
    );
    // …but the creator, signing in from their own IP, is not.
    expect(await authorizeCredentials({ email, password: "right-pass" }, fromIp("203.0.113.3"))).toMatchObject({ email });
  });

  it("refuses an email from one IP after 5 failed tries in 15 minutes, then allows it again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
    for (let i = 0; i < 5; i++) expect(await authorizeCredentials({ email, password: "wrong" }, fromIp("203.0.113.2"))).toBeNull();
    await expect(authorizeCredentials({ email, password: "right-pass" }, fromIp("203.0.113.2"))).rejects.toBeInstanceOf(
      SignInRateLimitedError
    );
    vi.setSystemTime(new Date("2026-11-19T12:15:01Z"));
    expect(await authorizeCredentials({ email, password: "right-pass" }, fromIp("203.0.113.2"))).toMatchObject({ email });
  });

  it("clears an email's failed tries from that IP after a successful sign-in", async () => {
    for (let i = 0; i < 4; i++) await authorizeCredentials({ email, password: "wrong" }, fromIp("203.0.113.4"));
    await authorizeCredentials({ email, password: "right-pass" }, fromIp("203.0.113.4"));
    for (let i = 0; i < 4; i++) expect(await authorizeCredentials({ email, password: "wrong" }, fromIp("203.0.113.4"))).toBeNull();
    expect(await authorizeCredentials({ email, password: "right-pass" }, fromIp("203.0.113.4"))).toMatchObject({ email });
  });

  it("refuses an IP after 20 failed tries across any emails", async () => {
    for (let i = 0; i < 20; i++) {
      await authorizeCredentials({ email: `nobody-${i}@test.local`, password: "x" }, fromIp("198.51.100.7"));
    }
    await expect(authorizeCredentials({ email, password: "right-pass" }, fromIp("198.51.100.7"))).rejects.toBeInstanceOf(
      SignInRateLimitedError
    );
    expect(await authorizeCredentials({ email, password: "right-pass" }, fromIp("198.51.100.8"))).toMatchObject({ email });
  });

  it("still counts an attacker who forges a new X-Forwarded-For address on every try (DIG-37)", async () => {
    for (let i = 0; i < 20; i++) {
      await authorizeCredentials({ email: `nobody-${i}@test.local`, password: "x" }, fromIp("198.51.100.9", `10.9.9.${i}`));
    }
    await expect(
      authorizeCredentials({ email, password: "right-pass" }, fromIp("198.51.100.9", "10.9.9.250"))
    ).rejects.toBeInstanceOf(SignInRateLimitedError);
  });
});
