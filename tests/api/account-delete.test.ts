import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { revalidateTag } from "next/cache";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { getStripeClient } from "@/lib/billing/stripe";
import { LocalStorageDriver, writeLocalObject } from "@/lib/storage/local";
import { sendVerificationEmail } from "@/lib/infra/email";
import { POST as DELETE_ACCOUNT } from "@/app/api/account/delete/route";
import { POST as SIGNUP } from "@/app/api/signup/route";
import sitemap from "@/app/sitemap";
import { publicZinePath } from "@/lib/zine/public-zine-path";
import { getPublicZine } from "@/lib/zine/public-zine";
import { createAsset, createZineUsing, jsonRequest, resetRateLimits, sessionFor } from "./helpers";

// DIG-108: deleting your own account, and everything it owns, once it is confirmed.
vi.mock("@/lib/auth/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/billing/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/stripe")>()),
  getStripeClient: vi.fn(),
}));
vi.mock("@/lib/infra/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/infra/email")>()),
  sendVerificationEmail: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const mockedUser = vi.mocked(getAuthenticatedUser);
const mockedStripe = vi.mocked(getStripeClient);
const captured = vi.mocked(Sentry.captureException);

const PASSWORD = "correct-horse-9";
const RUN = Date.now();
let counter = 0;
let dir: string;
const created: string[] = [];

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-account-"));
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `acct-${RUN}-again` } } });
  await prisma.$disconnect();
});

const stripe = { subscriptions: { list: vi.fn(), cancel: vi.fn() }, customers: { del: vi.fn() } };
beforeEach(async () => {
  await resetRateLimits();
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://zine.test");
  stripe.subscriptions.list.mockReset();
  stripe.subscriptions.cancel.mockReset();
  stripe.customers.del.mockReset();
  stripe.customers.del.mockResolvedValue({ deleted: true });
  stripe.subscriptions.list.mockResolvedValue({ data: [] });
  stripe.subscriptions.cancel.mockResolvedValue({});
  mockedStripe.mockReturnValue(null);
  vi.mocked(sendVerificationEmail).mockResolvedValue(undefined);
});

interface AccountOptions {
  kind?: "password" | "google";
  role?: "user" | "admin";
  stripeCustomerId?: string;
  published?: boolean;
}

const exists = (key: string) =>
  fs.access(path.join(dir, key)).then(
    () => true,
    () => false
  );

/** A creator with a board, two photos with real files, a zine, and a saved recipe. */
async function makeAccount(options: AccountOptions = {}) {
  const email = `acct-${RUN}-${counter++}@test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      name: "Delete Me",
      role: options.role ?? "user",
      passwordHash: options.kind === "google" ? null : await bcrypt.hash(PASSWORD, 4),
      googleId: options.kind === "google" ? `g-${email}` : null,
      emailVerifiedAt: new Date(),
      stripeCustomerId: options.stripeCustomerId ?? null,
    },
  });
  created.push(user.id);
  const photos = [await createAsset(user.id, 0, "one.jpg"), await createAsset(user.id, 1, "two.jpg")];
  for (const photo of photos) await writeLocalObject(photo.storageKey, Buffer.from("x"), "image/jpeg");
  const zine = await createZineUsing(user.id, photos[0].id, "Mine");
  if (options.published !== false) {
    await prisma.zine.update({ where: { id: zine.id }, data: { published: true, publishedAt: new Date() } });
  }
  await prisma.recipe.create({ data: { ownerId: user.id, name: "My recipe", settings: { filmSimulation: "Classic Chrome" } } });
  return { user, photos, zine, keys: photos.map((p) => p.storageKey) };
}

const post = (body: unknown, ip = "203.0.113.20") =>
  DELETE_ACCOUNT(
    new Request("http://test.local/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

/** Signs the account in (as the mocked `getAuthenticatedUser`), with a session that began `ageMs` ago. */
function signedInAs(account: Awaited<ReturnType<typeof makeAccount>>, ageMs = 0) {
  mockedUser.mockResolvedValue(sessionFor(account.user, ageMs === -1 ? null : Date.now() - ageMs));
}
const gone = async (id: string) => (await prisma.user.findUnique({ where: { id } })) === null;
const OLD = 60 * 60 * 1000;

describe("POST /api/account/delete: who may", () => {
  it("refuses a signed-out request", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await post({ email: "a@b.co" })).status).toBe(401);
  });

  it("refuses a body that is not JSON, or has no email", async () => {
    const account = await makeAccount();
    signedInAs(account);
    expect((await post("{")).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(await gone(account.user.id)).toBe(false);
  });

  it("refuses when the typed email is not the account's own, and deletes nothing", async () => {
    const account = await makeAccount();
    signedInAs(account);
    const res = await post({ email: "someone-else@test.local", password: PASSWORD });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("wrong_confirmation");
    expect(await gone(account.user.id)).toBe(false);
    for (const key of account.keys) expect(await exists(key)).toBe(true);
  });

  it("accepts the right email whatever its case or spacing", async () => {
    const account = await makeAccount();
    signedInAs(account);
    expect((await post({ email: `  ${account.user.email.toUpperCase()} `, password: PASSWORD })).status).toBe(200);
  });

  it("asks a password account whose sign-in is old for its password", async () => {
    const account = await makeAccount();
    signedInAs(account, OLD);
    const res = await post({ email: account.user.email });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("reauth_required");
    expect(await gone(account.user.id)).toBe(false);
  });

  it("refuses a wrong password even on a fresh sign-in, so a hijacked tab cannot guess its way in", async () => {
    const account = await makeAccount();
    signedInAs(account, 0);
    const res = await post({ email: account.user.email, password: "not-the-password" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("wrong_password");
    expect(await gone(account.user.id)).toBe(false);
  });

  it("accepts the right password on an old sign-in", async () => {
    const account = await makeAccount();
    signedInAs(account, OLD);
    expect((await post({ email: account.user.email, password: PASSWORD })).status).toBe(200);
  });

  it("accepts a sign-in from the last five minutes with no password", async () => {
    const account = await makeAccount();
    signedInAs(account, 2 * 60_000);
    expect((await post({ email: account.user.email })).status).toBe(200);
  });

  it("treats a session with no start time as an old one", async () => {
    const account = await makeAccount();
    signedInAs(account, -1);
    expect((await post({ email: account.user.email })).status).toBe(403);
  });

  it("makes a Google-only account sign in again: it has no password to give", async () => {
    const account = await makeAccount({ kind: "google" });
    signedInAs(account, OLD);
    const stale = await post({ email: account.user.email, password: PASSWORD });
    expect(stale.status).toBe(403);
    expect((await stale.json()).code).toBe("reauth_required");
    expect(await gone(account.user.id)).toBe(false);

    signedInAs(account, 60_000);
    expect((await post({ email: account.user.email })).status).toBe(200);
  });

  it("allows 5 attempts an hour per creator, then says to wait, and still deletes nothing", async () => {
    const account = await makeAccount();
    signedInAs(account);
    for (let i = 0; i < 5; i++) expect((await post({ email: "wrong@test.local" })).status).toBe(400);
    const blocked = await post({ email: account.user.email, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe("rate_limited");
    expect(await gone(account.user.id)).toBe(false);
  });
});

describe("POST /api/account/delete: what goes", () => {
  it("removes the account and everything it owns, and every stored file", async () => {
    const account = await makeAccount();
    const other = await makeAccount();
    signedInAs(account);
    const res = await post({ email: account.user.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(await gone(account.user.id)).toBe(true);
    for (const model of [prisma.board, prisma.mediaAsset, prisma.zine, prisma.recipe] as const) {
      expect(await (model as unknown as { count: (a: unknown) => Promise<number> }).count({ where: { ownerId: account.user.id } })).toBe(0);
    }
    for (const key of account.keys) expect(await exists(key), key).toBe(false);

    // Nobody else's account, zines, or files are touched.
    expect(await gone(other.user.id)).toBe(false);
    expect(await prisma.zine.count({ where: { ownerId: other.user.id } })).toBe(1);
    for (const key of other.keys) expect(await exists(key), key).toBe(true);
  });

  it("takes the published zine off the public page and the sitemap at once, and drops its cached page", async () => {
    const account = await makeAccount();
    const address = publicZinePath(account.user.publicId, account.zine.slug);
    expect((await sitemap()).map((e) => e.url)).toContain(`https://zine.test${address}`);
    expect(await getPublicZine(account.user.publicId, account.zine.slug)).not.toBeNull();

    signedInAs(account);
    expect((await post({ email: account.user.email, password: PASSWORD })).status).toBe(200);

    expect(await getPublicZine(account.user.publicId, account.zine.slug)).toBeNull();
    expect((await sitemap()).map((e) => e.url)).not.toContain(`https://zine.test${address}`);
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(`public-zine:${account.user.publicId}/${account.zine.slug}`);
  });

  it("lets the same email sign up again afterwards", async () => {
    const account = await makeAccount();
    signedInAs(account);
    await post({ email: account.user.email, password: PASSWORD });
    const again = await SIGNUP(
      jsonRequest("/api/signup", "POST", {
        name: "Back Again",
        email: account.user.email,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        acceptTerms: true,
      })
    );
    expect(again.status).toBe(201);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { email: account.user.email } });
    expect(fresh.id).not.toBe(account.user.id);
    expect(await prisma.mediaAsset.count({ where: { ownerId: fresh.id } })).toBe(0);
    await prisma.user.delete({ where: { id: fresh.id } });
  });
});

describe("POST /api/account/delete: the subscription", () => {
  it("cancels every live subscription at once, with no proration or refund, and leaves ended ones alone", async () => {
    const account = await makeAccount({ stripeCustomerId: "cus_live" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        { id: "sub_active", status: "active" },
        { id: "sub_past_due", status: "past_due" },
        { id: "sub_old", status: "canceled" },
        { id: "sub_never", status: "incomplete_expired" },
      ],
    });
    signedInAs(account);
    expect((await post({ email: account.user.email, password: PASSWORD })).status).toBe(200);

    expect(stripe.subscriptions.list).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_live", status: "all" }));
    expect(stripe.subscriptions.cancel.mock.calls).toEqual([["sub_active"], ["sub_past_due"]]);
    expect(await gone(account.user.id)).toBe(true);
  });

  it("then deletes the Stripe customer, so no card or contact details stay there, after the subscriptions are ended", async () => {
    const account = await makeAccount({ stripeCustomerId: "cus_remove" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub_active", status: "active" }] });
    signedInAs(account);
    expect((await post({ email: account.user.email, password: PASSWORD })).status).toBe(200);

    expect(stripe.customers.del).toHaveBeenCalledTimes(1);
    expect(stripe.customers.del).toHaveBeenCalledWith("cus_remove");
    expect(stripe.subscriptions.cancel.mock.invocationCallOrder[0]).toBeLessThan(stripe.customers.del.mock.invocationCallOrder[0]);
  });

  it("deletes the Stripe customer of an account whose subscription ended long ago", async () => {
    const account = await makeAccount({ stripeCustomerId: "cus_lapsed" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub_old", status: "canceled" }] });
    signedInAs(account);
    expect((await post({ email: account.user.email, password: PASSWORD })).status).toBe(200);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripe.customers.del).toHaveBeenCalledWith("cus_lapsed");
  });

  it("does not delete a customer when the account has none", async () => {
    const account = await makeAccount();
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    signedInAs(account);
    await post({ email: account.user.email, password: PASSWORD });
    expect(stripe.customers.del).not.toHaveBeenCalled();
  });

  it("accepts a customer Stripe has already deleted, so a retry after a later failure goes through", async () => {
    const account = await makeAccount({ stripeCustomerId: "cus_already" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.subscriptions.list.mockRejectedValue(Object.assign(new Error("No such customer"), { code: "resource_missing" }));
    stripe.customers.del.mockRejectedValue(Object.assign(new Error("No such customer"), { code: "resource_missing" }));
    signedInAs(account);
    expect((await post({ email: account.user.email, password: PASSWORD })).status).toBe(200);
  });

  it("deletes nothing when Stripe cannot delete the customer, tells the owner, and a retry finishes", async () => {
    const account = await makeAccount({ stripeCustomerId: "cus_stuck" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.customers.del.mockRejectedValueOnce(new Error("Stripe is down"));
    signedInAs(account);

    const failed = await post({ email: account.user.email, password: PASSWORD });
    expect(failed.status).toBe(502);
    expect((await failed.json()).code).toBe("stripe_failed");
    expect(await gone(account.user.id)).toBe(false);
    for (const key of account.keys) expect(await exists(key)).toBe(true);
    expect(captured).toHaveBeenCalledWith(expect.objectContaining({ message: "Stripe is down" }), {
      tags: { area: "account-deletion", step: "stripe" },
      user: { id: account.user.id },
    });

    expect((await post({ email: account.user.email, password: PASSWORD })).status).toBe(200);
    expect(await gone(account.user.id)).toBe(true);
  });

  it("does not need Stripe for an account that never subscribed", async () => {
    const account = await makeAccount();
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    signedInAs(account);
    expect((await post({ email: account.user.email, password: PASSWORD })).status).toBe(200);
    expect(stripe.subscriptions.list).not.toHaveBeenCalled();
  });

  it("treats a customer Stripe no longer knows as having nothing to cancel", async () => {
    const account = await makeAccount({ stripeCustomerId: "cus_gone" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.subscriptions.list.mockRejectedValue(Object.assign(new Error("No such customer"), { code: "resource_missing" }));
    signedInAs(account);
    expect((await post({ email: account.user.email, password: PASSWORD })).status).toBe(200);
  });

  it("deletes nothing, says so, and tells the owner when Stripe fails; a retry then finishes the job", async () => {
    const account = await makeAccount({ stripeCustomerId: "cus_flaky" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub_1", status: "active" }] });
    stripe.subscriptions.cancel.mockRejectedValueOnce(new Error("Stripe is down"));
    signedInAs(account);

    const failed = await post({ email: account.user.email, password: PASSWORD });
    expect(failed.status).toBe(502);
    const body = await failed.json();
    expect(body.code).toBe("stripe_failed");
    expect(body.error).toMatch(/nothing was deleted/i);
    expect(await gone(account.user.id)).toBe(false);
    for (const key of account.keys) expect(await exists(key)).toBe(true);
    expect(captured).toHaveBeenCalledWith(expect.objectContaining({ message: "Stripe is down" }), {
      tags: { area: "account-deletion", step: "stripe" },
      user: { id: account.user.id },
    });

    const retried = await post({ email: account.user.email, password: PASSWORD });
    expect(retried.status).toBe(200);
    expect(await gone(account.user.id)).toBe(true);
  });

  it("refuses, and deletes nothing, when the account has a subscription but billing is not set up here", async () => {
    const account = await makeAccount({ stripeCustomerId: "cus_x" });
    mockedStripe.mockReturnValue(null);
    signedInAs(account);
    const res = await post({ email: account.user.email, password: PASSWORD });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("billing_unavailable");
    expect(await gone(account.user.id)).toBe(false);
  });
});

describe("POST /api/account/delete: when storage fails", () => {
  it("keeps the account, says so, tells the owner, and a retry finishes the job without cancelling twice", async () => {
    const account = await makeAccount({ stripeCustomerId: "cus_store" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    stripe.subscriptions.list.mockResolvedValueOnce({ data: [{ id: "sub_1", status: "active" }] });
    stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub_1", status: "canceled" }] });
    signedInAs(account);
    vi.spyOn(LocalStorageDriver.prototype, "deletePrefix").mockRejectedValueOnce(new Error("bucket unreachable"));

    const failed = await post({ email: account.user.email, password: PASSWORD });
    expect(failed.status).toBe(502);
    const body = await failed.json();
    expect(body.code).toBe("storage_failed");
    expect(body.error).toMatch(/subscription was cancelled/i);
    expect(body.error).toMatch(/try again/i);
    expect(await gone(account.user.id)).toBe(false);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(captured).toHaveBeenCalledWith(expect.objectContaining({ message: "bucket unreachable" }), {
      tags: { area: "account-deletion", step: "storage" },
      user: { id: account.user.id },
    });

    const retried = await post({ email: account.user.email, password: PASSWORD });
    expect(retried.status).toBe(200);
    expect(await gone(account.user.id)).toBe(true);
    for (const key of account.keys) expect(await exists(key)).toBe(false);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
  });

  it("reports nothing to the owner when everything works", async () => {
    const account = await makeAccount();
    signedInAs(account);
    await post({ email: account.user.email, password: PASSWORD });
    expect(captured).not.toHaveBeenCalled();
  });
});

describe("POST /api/account/delete: the last admin", () => {
  /** Makes `keep` the only admin for the length of one test, and returns how to put the others back. */
  async function onlyAdmin(keep: string) {
    const others = await prisma.user.findMany({ where: { role: "admin", id: { not: keep } }, select: { id: true } });
    await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { role: "user" } });
    return () => prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { role: "admin" } });
  }

  it("refuses to delete the only admin, and touches nothing", async () => {
    const account = await makeAccount({ role: "admin", stripeCustomerId: "cus_admin" });
    const restore = await onlyAdmin(account.user.id);
    try {
      mockedStripe.mockReturnValue(stripe as unknown as Stripe);
      signedInAs(account);
      const res = await post({ email: account.user.email, password: PASSWORD });
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("last_admin");
      expect(await gone(account.user.id)).toBe(false);
      expect(stripe.subscriptions.list).not.toHaveBeenCalled();
      for (const key of account.keys) expect(await exists(key)).toBe(true);
    } finally {
      await restore();
    }
  });

  it("lets an admin delete their own account when another admin remains", async () => {
    const account = await makeAccount({ role: "admin" });
    const second = await makeAccount({ role: "admin" });
    signedInAs(account);
    expect((await post({ email: account.user.email, password: PASSWORD })).status).toBe(200);
    expect(await gone(account.user.id)).toBe(true);
    expect(await gone(second.user.id)).toBe(false);
  });

  it("lets the first of the last two admins go, and refuses the second", async () => {
    const a = await makeAccount({ role: "admin" });
    const b = await makeAccount({ role: "admin" });
    const restore = await onlyAdmin(a.user.id);
    await prisma.user.update({ where: { id: b.user.id }, data: { role: "admin" } });
    try {
      const run = async (account: typeof a) => {
        mockedUser.mockResolvedValue(sessionFor(account.user));
        return post({ email: account.user.email, password: PASSWORD }, `198.51.100.${account === a ? 1 : 2}`);
      };
      const results = [await run(a), await run(b)];
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prisma.user.count({ where: { role: "admin", id: { in: [a.user.id, b.user.id] } } })).toBe(1);
    } finally {
      await restore();
    }
  });
});
