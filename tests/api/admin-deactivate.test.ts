import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type Stripe from "stripe";
import { revalidateTag } from "next/cache";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe";
import { checkSessionToken } from "@/lib/session-token";
import { AccountDeactivatedError, authorizeCredentials } from "@/lib/sign-in";
import { resolveGoogleUser } from "@/lib/google-signin";
import { consumeVerificationToken, issueVerificationToken } from "@/lib/email-verification";
import { getPublicZine } from "@/lib/public-zine";
import { legacyZineAddress } from "@/lib/legacy-zine-url";
import { cancelIfDeactivated } from "@/lib/admin-users";
import sitemap from "@/app/sitemap";
import { POST as STATUS } from "@/app/api/admin/users/[id]/status/route";
import { POST as DELETE_USER } from "@/app/api/admin/users/[id]/delete/route";
import { POST as SET_ROLE } from "@/app/api/admin/users/[id]/role/route";
import { createAsset, createZineUsing, jsonRequest, params, resetRateLimits, sessionFor } from "./helpers";

// DIG-137: admins deactivate, reactivate, and delete accounts.
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stripe")>()),
  getStripeClient: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);
const mockedStripe = vi.mocked(getStripeClient);

const PASSWORD = "correct-horse-9";
const OLD = 60 * 60 * 1000;
const created: string[] = [];
const stripe = { subscriptions: { list: vi.fn(), update: vi.fn(), cancel: vi.fn() }, customers: { del: vi.fn() } };

beforeEach(async () => {
  await resetRateLimits();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://zine.test");
  for (const fn of [stripe.subscriptions.list, stripe.subscriptions.update, stripe.subscriptions.cancel, stripe.customers.del]) fn.mockReset();
  stripe.subscriptions.list.mockResolvedValue({ data: [] });
  stripe.subscriptions.update.mockResolvedValue({});
  stripe.subscriptions.cancel.mockResolvedValue({});
  stripe.customers.del.mockResolvedValue({ deleted: true });
  mockedStripe.mockReturnValue(null);
});
afterAll(async () => {
  await prisma.adminAction.deleteMany({ where: { targetId: { in: created } } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

async function make(role: "user" | "admin" = "user", extra: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: {
      email: `deact-${randomUUID()}@test.local`,
      name: "Deactivate Test",
      role,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      emailVerifiedAt: new Date(),
      ...extra,
    },
  });
  created.push(user.id);
  return user;
}
type Account = Awaited<ReturnType<typeof make>>;

async function withPublishedZine(extra: Record<string, unknown> = {}) {
  const user = await make("user", extra);
  const photo = await createAsset(user.id, 0);
  await prisma.mediaAsset.update({ where: { id: photo.id }, data: { status: "ready" } });
  const zine = await createZineUsing(user.id, photo.id, "Hidden Soon");
  await prisma.zine.update({ where: { id: zine.id }, data: { published: true, publishedAt: new Date() } });
  return { user, zine: await prisma.zine.findUniqueOrThrow({ where: { id: zine.id } }) };
}

const signIn = (user: Account, ageMs: number | null = 0) =>
  mockedUser.mockResolvedValue(sessionFor(user, ageMs === null ? null : Date.now() - ageMs));
const status = (id: string, body: unknown) => STATUS(jsonRequest(`/api/admin/users/${id}/status`, "POST", body), params({ id }));
const remove = (id: string, body: unknown) => DELETE_USER(jsonRequest(`/api/admin/users/${id}/delete`, "POST", body), params({ id }));
const fresh = (id: string) => prisma.user.findUnique({ where: { id } });
const actions = async (targetId: string) =>
  (await prisma.adminAction.findMany({ where: { targetId }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
const req = new Request("http://test.local/api/auth/callback/credentials", { headers: { "x-forwarded-for": "203.0.113.77" } });

describe("POST /api/admin/users/[id]/status: who may", () => {
  it("returns 401 signed out and 403 to a regular user", async () => {
    const target = await make();
    mockedUser.mockResolvedValue(null);
    expect((await status(target.id, { action: "deactivate" })).status).toBe(401);
    signIn(await make());
    expect((await status(target.id, { action: "deactivate", password: PASSWORD })).status).toBe(403);
    expect((await fresh(target.id))?.deactivatedAt).toBeNull();
  });

  it("validates the body and answers 404 for nobody", async () => {
    signIn(await make("admin"));
    const target = await make();
    for (const body of ["{", {}, { action: "ban" }]) expect((await status(target.id, body)).status).toBe(400);
    expect((await status("no-such-user", { action: "deactivate" })).status).toBe(404);
  });

  it("needs the password or a recent sign-in", async () => {
    const admin = await make("admin");
    const target = await make();
    signIn(admin, OLD);
    expect((await (await status(target.id, { action: "deactivate" })).json()).code).toBe("reauth_required");
    expect((await (await status(target.id, { action: "deactivate", password: "nope" })).json()).code).toBe("wrong_password");
    expect((await fresh(target.id))?.deactivatedAt).toBeNull();
    expect((await status(target.id, { action: "deactivate", password: PASSWORD })).status).toBe(200);
  });

  it("refuses yourself, and an admin until their role is removed", async () => {
    const admin = await make("admin");
    const other = await make("admin");
    signIn(admin);
    const self = await status(admin.id, { action: "deactivate" });
    expect([self.status, (await self.json()).code]).toEqual([409, "self"]);
    const onAdmin = await status(other.id, { action: "deactivate" });
    expect([onAdmin.status, (await onAdmin.json()).code]).toEqual([409, "target_admin"]);
    expect((await fresh(other.id))?.deactivatedAt).toBeNull();
    await SET_ROLE(jsonRequest(`/api/admin/users/${other.id}/role`, "POST", { role: "user" }), params({ id: other.id }));
    expect((await status(other.id, { action: "deactivate" })).status).toBe(200);
  });

  it("refuses an admin whose role was removed, or who was deactivated, after their session was read", async () => {
    const target = await make();
    const demoted = await make("admin");
    signIn(demoted);
    await prisma.user.update({ where: { id: demoted.id }, data: { role: "user" } });
    expect((await status(target.id, { action: "deactivate" })).status).toBe(403);
    const deactivated = await make("admin", { deactivatedAt: new Date() });
    signIn(deactivated);
    expect((await status(target.id, { action: "deactivate" })).status).toBe(403);
    expect((await fresh(target.id))?.deactivatedAt).toBeNull();
  });

  it("will not make a deactivated account an admin", async () => {
    signIn(await make("admin"));
    const target = await make("user", { deactivatedAt: new Date() });
    const res = await SET_ROLE(jsonRequest(`/api/admin/users/${target.id}/role`, "POST", { role: "admin" }), params({ id: target.id }));
    expect([res.status, (await res.json()).code]).toEqual([409, "deactivated"]);
    expect((await fresh(target.id))?.role).toBe("user");
  });

  it("is rate limited, sharing the limit with role changes", async () => {
    signIn(await make("admin"));
    const target = await make();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await status(target.id, { action: "reactivate" })).status;
    expect(last).toBe(429);
  });
});

describe("deactivating", () => {
  it("signs the person out everywhere and records it once", async () => {
    signIn(await make("admin"));
    const target = await make();
    const token = { sub: target.id, authAt: Date.now() - 1000 };
    expect(await checkSessionToken(token)).toBe(token);
    const res = await status(target.id, { action: "deactivate" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: target.id, deactivated: true, billing: "none" });
    expect(await checkSessionToken(token)).toBeNull();
    // A second request changes nothing and records nothing more.
    expect((await status(target.id, { action: "deactivate" })).status).toBe(200);
    expect(await actions(target.id)).toEqual(["deactivate"]);
  });

  it("refuses the right password, and says why only after it is proven", async () => {
    signIn(await make("admin"));
    const target = await make();
    await status(target.id, { action: "deactivate" });
    expect(await authorizeCredentials({ email: target.email, password: "wrong-pass-1" }, req)).toBeNull();
    await expect(authorizeCredentials({ email: target.email, password: PASSWORD }, req)).rejects.toBeInstanceOf(AccountDeactivatedError);
  });

  it("refuses Google, for a linked account and by linking on email", async () => {
    signIn(await make("admin"));
    const linked = await make("user", { googleId: `g-${randomUUID()}` });
    const byEmail = await make("user");
    for (const t of [linked, byEmail]) await status(t.id, { action: "deactivate" });
    expect(await resolveGoogleUser({ sub: linked.googleId!, email: linked.email, email_verified: true })).toEqual({ ok: false, reason: "deactivated" });
    expect(await resolveGoogleUser({ sub: `g-${randomUUID()}`, email: byEmail.email, email_verified: true })).toEqual({ ok: false, reason: "deactivated" });
    expect((await fresh(byEmail.id))?.googleId).toBeNull();
  });

  it("refuses an email link", async () => {
    signIn(await make("admin"));
    const target = await make("user", { emailVerifiedAt: null });
    const link = await issueVerificationToken(target.id);
    await status(target.id, { action: "deactivate" });
    await expect(consumeVerificationToken(link)).rejects.toBeInstanceOf(AccountDeactivatedError);
    expect((await fresh(target.id))?.emailVerifiedAt).toBeNull();
  });

  it("hides the person's zines from their page, old links, and the sitemap, and drops the cached page; reactivating brings them back", async () => {
    signIn(await make("admin"));
    const { user, zine } = await withPublishedZine();
    const address = `https://zine.test/z/${user.publicId}/${zine.slug}`;
    expect(await getPublicZine(user.publicId, zine.slug)).not.toBeNull();
    vi.mocked(revalidateTag).mockClear();

    await status(user.id, { action: "deactivate" });
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(`public-zine:${user.publicId}/${zine.slug}`);
    expect(await getPublicZine(user.publicId, zine.slug)).toBeNull();
    expect(await legacyZineAddress(zine.slug)).toBeNull();
    expect((await sitemap()).map((e) => e.url)).not.toContain(address);

    vi.mocked(revalidateTag).mockClear();
    const back = await status(user.id, { action: "reactivate" });
    expect(await back.json()).toEqual({ id: user.id, deactivated: false });
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(`public-zine:${user.publicId}/${zine.slug}`);
    expect(await getPublicZine(user.publicId, zine.slug)).not.toBeNull();
    expect((await sitemap()).map((e) => e.url)).toContain(address);
    expect(await actions(user.id)).toEqual(["deactivate", "reactivate"]);
  });

  it("lets a reactivated person sign in again, but does not revive their old sessions", async () => {
    signIn(await make("admin"));
    const target = await make();
    const old = { sub: target.id, authAt: Date.now() - 1000 };
    await status(target.id, { action: "deactivate" });
    await status(target.id, { action: "reactivate" });
    expect(await checkSessionToken(old)).toBeNull();
    expect(await authorizeCredentials({ email: target.email, password: PASSWORD }, req)).toMatchObject({ id: target.id });
  });

  it("sets every live subscription to cancel at the period end, and none is cancelled now", async () => {
    signIn(await make("admin"));
    const target = await make("user", { stripeCustomerId: `cus_${randomUUID()}`, tier: "pro", subscriptionStatus: "active" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        { id: "sub_live", status: "active", cancel_at_period_end: false },
        { id: "sub_due", status: "past_due", cancel_at_period_end: false },
        { id: "sub_already", status: "active", cancel_at_period_end: true },
        { id: "sub_old", status: "canceled", cancel_at_period_end: false },
      ],
    });
    const res = await status(target.id, { action: "deactivate" });
    expect((await res.json()).billing).toBe("cancelling");
    expect(stripe.subscriptions.update.mock.calls).toEqual([["sub_live", { cancel_at_period_end: true }], ["sub_due", { cancel_at_period_end: true }]]);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    // Reactivating does not resume it.
    stripe.subscriptions.update.mockClear();
    await status(target.id, { action: "reactivate" });
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("still deactivates when Stripe fails or is not set up, says so, and a retry finishes the billing", async () => {
    signIn(await make("admin"));
    const target = await make("user", { stripeCustomerId: `cus_${randomUUID()}` });
    const unset = await status(target.id, { action: "deactivate" });
    expect([unset.status, (await unset.json()).billing]).toEqual([200, "unavailable"]);
    expect((await fresh(target.id))?.deactivatedAt).toBeInstanceOf(Date);

    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.subscriptions.list.mockRejectedValueOnce(new Error("Stripe is down"));
    expect((await (await status(target.id, { action: "deactivate" })).json()).billing).toBe("failed");
    stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub_live", status: "active", cancel_at_period_end: false }] });
    expect((await (await status(target.id, { action: "deactivate" })).json()).billing).toBe("cancelling");
    expect(await actions(target.id)).toEqual(["deactivate"]);
  });

  it("refuses to reactivate an account that is not deactivated, without recording it", async () => {
    signIn(await make("admin"));
    const target = await make();
    const res = await status(target.id, { action: "reactivate" });
    expect([res.status, await res.json()]).toEqual([200, { id: target.id, deactivated: false }]);
    expect(await actions(target.id)).toEqual([]);
  });
});

describe("cancelIfDeactivated (billing webhook)", () => {
  const sub = (extra: Partial<Stripe.Subscription>) => ({ id: "sub_late", status: "active", cancel_at_period_end: false, cancel_at: null, ...extra }) as Stripe.Subscription;
  it("sets a paying subscription on a deactivated account to end at the period end", async () => {
    await cancelIfDeactivated(stripe as unknown as Stripe, { deactivatedAt: new Date() }, sub({}));
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_late", { cancel_at_period_end: true });
  });
  it("leaves active accounts, ended subscriptions, and ones already ending alone", async () => {
    await cancelIfDeactivated(stripe as unknown as Stripe, { deactivatedAt: null }, sub({}));
    await cancelIfDeactivated(stripe as unknown as Stripe, { deactivatedAt: new Date() }, sub({ status: "canceled" }));
    await cancelIfDeactivated(stripe as unknown as Stripe, { deactivatedAt: new Date() }, sub({ cancel_at_period_end: true }));
    await cancelIfDeactivated(stripe as unknown as Stripe, { deactivatedAt: new Date() }, sub({ cancel_at: 1_900_000_000 }));
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/users/[id]/delete", () => {
  it("returns 401 signed out and 403 to a regular user", async () => {
    const target = await make();
    mockedUser.mockResolvedValue(null);
    expect((await remove(target.id, { email: target.email })).status).toBe(401);
    signIn(await make());
    expect((await remove(target.id, { email: target.email, password: PASSWORD })).status).toBe(403);
    expect(await fresh(target.id)).not.toBeNull();
  });

  it("needs the person's email typed out, and the admin's password or a recent sign-in", async () => {
    const admin = await make("admin");
    const target = await make();
    signIn(admin);
    for (const body of ["{", {}]) expect((await remove(target.id, body)).status).toBe(400);
    const wrong = await remove(target.id, { email: "someone@test.local" });
    expect([wrong.status, (await wrong.json()).code]).toEqual([400, "wrong_confirmation"]);
    signIn(admin, OLD);
    expect((await (await remove(target.id, { email: target.email })).json()).code).toBe("reauth_required");
    expect(await fresh(target.id)).not.toBeNull();
    expect(await actions(target.id)).toEqual([]);
  });

  it("answers 404 for nobody, and refuses yourself and an admin", async () => {
    const admin = await make("admin");
    const other = await make("admin");
    signIn(admin);
    expect((await remove("no-such-user", { email: "x@test.local" })).status).toBe(404);
    expect((await (await remove(admin.id, { email: admin.email })).json()).code).toBe("self");
    const onAdmin = await remove(other.id, { email: other.email });
    expect([onAdmin.status, (await onAdmin.json()).code]).toEqual([409, "target_admin"]);
    expect(await fresh(other.id)).not.toBeNull();
  });

  it("removes the account and everything it owns, hides its zine at once, and keeps the record", async () => {
    signIn(await make("admin"));
    const { user, zine } = await withPublishedZine();
    vi.mocked(revalidateTag).mockClear();
    const res = await remove(user.id, { email: `  ${user.email.toUpperCase()} ` });
    expect([res.status, await res.json()]).toEqual([200, { id: user.id, deleted: true }]);
    expect(await fresh(user.id)).toBeNull();
    expect(await prisma.zine.count({ where: { ownerId: user.id } })).toBe(0);
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(`public-zine:${user.publicId}/${zine.slug}`);
    expect(await actions(user.id)).toEqual(["deactivate", "delete_user"]);
  });

  it("cancels the subscription at once, as deleting your own account does", async () => {
    signIn(await make("admin"));
    const target = await make("user", { stripeCustomerId: `cus_${randomUUID()}` });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub_live", status: "active" }] });
    expect((await remove(target.id, { email: target.email })).status).toBe(200);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_live");
  });

  it("leaves the person deactivated, not deleted, when a step fails, and a retry finishes", async () => {
    signIn(await make("admin"));
    const target = await make("user", { stripeCustomerId: `cus_${randomUUID()}` });
    const failed = await remove(target.id, { email: target.email });
    expect([failed.status, (await failed.json()).code]).toEqual([503, "billing_unavailable"]);
    expect((await fresh(target.id))?.deactivatedAt).toBeInstanceOf(Date);
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    expect((await remove(target.id, { email: target.email })).status).toBe(200);
    expect(await actions(target.id)).toEqual(["deactivate", "delete_user"]);
  });
});
