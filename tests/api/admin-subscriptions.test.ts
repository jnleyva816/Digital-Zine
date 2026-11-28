import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { GET as LIST } from "@/app/api/admin/subscriptions/route";
import { resetRateLimits, sessionFor } from "./helpers";

// DIG-139: admins see who is paying, read-only, with a link to Stripe.
vi.mock("@/lib/auth/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);
const created: string[] = [];
const TAG = randomUUID().slice(0, 8);

beforeEach(async () => {
  await resetRateLimits();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

async function make(role: "user" | "admin" = "user", extra: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: { email: `subs-${TAG}-${randomUUID()}@test.local`, name: "Sub", role, passwordHash: "x", emailVerifiedAt: new Date(), ...extra },
  });
  created.push(user.id);
  return user;
}
const subscriber = (status: string, extra: Record<string, unknown> = {}) =>
  make("user", { subscriptionStatus: status, tier: ["active", "trialing", "past_due"].includes(status) ? "pro" : "free", stripeCustomerId: `cus_${randomUUID()}`, stripeSubscriptionId: `sub_${randomUUID().replaceAll("-", "")}`, ...extra });
const signIn = (user: Awaited<ReturnType<typeof make>>) => mockedUser.mockResolvedValue(sessionFor(user));
const list = (query = "") => LIST(new Request(`http://test.local/api/admin/subscriptions${query}`));

/** Every page, keeping only this file's accounts. */
async function all() {
  const rows: { userId: string; status: string }[] = [];
  let cursor: string | null = null;
  let configured = true;
  do {
    const body: { subscriptions: { userId: string; email: string; status: string }[]; nextCursor: string | null; billingConfigured: boolean } = await (
      await list(cursor ? `?cursor=${encodeURIComponent(cursor)}` : "")
    ).json();
    configured = body.billingConfigured;
    rows.push(...body.subscriptions.filter((s) => s.email.startsWith(`subs-${TAG}`)));
    cursor = body.nextCursor;
  } while (cursor);
  return { rows, configured };
}

describe("GET /api/admin/subscriptions", () => {
  it("returns 401 signed out and 403 to a regular user, with nothing in the body", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await list()).status).toBe(401);
    signIn(await make());
    const res = await list();
    expect(res.status).toBe(403);
    expect(await res.json()).not.toHaveProperty("subscriptions");
  });

  it("counts active, trialing, and past due as active, the statuses that keep Pro, and nothing else", async () => {
    signIn(await make("admin"));
    const keep = [await subscriber("active"), await subscriber("trialing"), await subscriber("past_due")];
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "inactive"]) await subscriber(status);
    await make("user", { subscriptionStatus: "active", tier: "pro" }); // no Stripe subscription on record
    const { rows } = await all();
    expect(rows.map((r) => r.userId).sort()).toEqual(keep.map((u) => u.id).sort());
  });

  it("sends exactly what the page shows, with a test-mode Stripe link, never cached", async () => {
    signIn(await make("admin"));
    const user = await subscriber("past_due", { deactivatedAt: new Date() });
    const res = await list();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.billingConfigured).toBe(true);
    const mine = (await all()).rows.find((r) => r.userId === user.id);
    expect(mine).toEqual({
      userId: user.id,
      email: user.email,
      status: "past_due",
      deactivated: true,
      stripeUrl: `https://dashboard.stripe.com/test/subscriptions/${user.stripeSubscriptionId}`,
    });
  });

  it("still lists subscriptions when billing is not set up, says so, and gives no links", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    signIn(await make("admin"));
    const user = await subscriber("active");
    const { rows, configured } = await all();
    expect(configured).toBe(false);
    expect(rows.find((r) => r.userId === user.id)).toMatchObject({ status: "active", stripeUrl: null });
  });

  it("refuses a bad cursor, and is rate limited with the panel's other lists", async () => {
    signIn(await make("admin"));
    expect((await list("?cursor=nope")).status).toBe(400);
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await list()).status;
    expect(last).toBe(429);
  });
});
