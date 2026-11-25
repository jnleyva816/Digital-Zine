import * as Sentry from "@sentry/nextjs";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { revalidatePublicZines } from "@/lib/public-zine-cache";
import { deleteAccountCompletely, type DeletionFailure } from "@/lib/account-deletion";

/** How many accounts one page of the admin user list holds (DIG-136). */
export const ADMIN_PAGE_SIZE = 25;

/** Everything the panel knows about an account. Built by name, so a new column is never sent by accident. */
export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: "user" | "admin";
  /** The billed tier, not an admin's free Pro. */
  tier: "free" | "pro";
  verified: boolean;
  /** An admin deactivated the account (DIG-137). */
  deactivated: boolean;
  zineCount: number;
  createdAt: string;
}

export interface AdminUserPage {
  users: AdminUser[];
  nextCursor: string | null;
}

type Cursor = { createdAt: Date; id: string };

/** The position after one account. It holds the values, so it works after that account is deleted. */
const writeCursor = (c: Cursor) => `${c.createdAt.toISOString()}_${c.id}`;

export function readCursor(text: string): Cursor | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([A-Za-z0-9-]{1,64})$/.exec(text);
  if (!match) return null;
  const createdAt = new Date(match[1]);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: match[2] };
}

/** Prisma passes `contains` to ILIKE as it is, so a typed % or _ would match anything. */
const literal = (text: string) => text.replace(/[\\%_]/g, "\\$&");

/** One page of accounts, newest first, whose name or email contains `query`. */
export async function listAdminUsers({ query = "", cursor = null }: { query?: string; cursor?: Cursor | null } = {}): Promise<AdminUserPage> {
  const filters: Prisma.UserWhereInput[] = [];
  const term = query.trim();
  if (term) {
    const contains = { contains: literal(term), mode: "insensitive" } as const;
    filters.push({ OR: [{ email: contains }, { name: contains }] });
  }
  if (cursor) {
    filters.push({ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] });
  }
  const rows = await prisma.user.findMany({
    where: { AND: filters },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE_SIZE + 1,
    select: { id: true, name: true, email: true, role: true, tier: true, emailVerifiedAt: true, deactivatedAt: true, createdAt: true, _count: { select: { zines: true } } },
  });
  const page = rows.slice(0, ADMIN_PAGE_SIZE);
  return {
    users: page.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      tier: u.tier,
      verified: u.emailVerifiedAt !== null,
      deactivated: u.deactivatedAt !== null,
      zineCount: u._count.zines,
      createdAt: u.createdAt.toISOString(),
    })),
    nextCursor: rows.length > ADMIN_PAGE_SIZE ? writeCursor(page[page.length - 1]) : null,
  };
}

type Tx = Prisma.TransactionClient;

/** Read inside the lock, so a role removed or an account deactivated a moment ago counts. */
async function isActiveAdmin(tx: Tx, id: string): Promise<boolean> {
  const actor = await tx.user.findUnique({ where: { id }, select: { role: true, deactivatedAt: true } });
  return actor?.role === "admin" && actor.deactivatedAt === null;
}

const lockAdmins = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('dz-last-admin'))`;

export type RoleChange = "ok" | "self" | "forbidden" | "not_found" | "unverified" | "deactivated";

/**
 * Gives or removes the admin role, and records it in the same transaction. Nobody changes their own
 * role, and the lock (shared with account deletion) makes the actor's role current, so there is
 * always an admin left: the one who acted.
 */
export async function changeRole(actorId: string, targetId: string, role: "user" | "admin"): Promise<RoleChange> {
  if (actorId === targetId) return "self";
  return prisma.$transaction(async (tx) => {
    await lockAdmins(tx);
    if (!(await isActiveAdmin(tx, actorId))) return "forbidden";
    const target = await tx.user.findUnique({ where: { id: targetId }, select: { role: true, emailVerifiedAt: true, deactivatedAt: true } });
    if (!target) return "not_found";
    if (target.role === role) return "ok";
    if (role === "admin" && target.deactivatedAt) return "deactivated";
    // Whoever signed up with an unproven address may not own it, and may know its password.
    if (role === "admin" && !target.emailVerifiedAt) return "unverified";
    await tx.user.update({ where: { id: targetId }, data: { role } });
    await tx.adminAction.create({ data: { actorId, targetId, action: role === "admin" ? "grant_admin" : "revoke_admin" } });
    return "ok";
  });
}


/** Subscription statuses that are over and need nothing more. */
const ENDED_SUBSCRIPTION = new Set(["canceled", "incomplete_expired"]);

/** What happened to a deactivated person's billing: none to stop, set to end at the period end, or not yet. */
export type BillingOutcome = "none" | "cancelling" | "unavailable" | "failed";

const isMissing = (error: unknown) => (error as { code?: unknown } | null)?.code === "resource_missing";

/**
 * Sets every live subscription to end at the period end (owner, 25 Nov): no further charge, no
 * refund. Safe to repeat, so a retry finishes what a Stripe failure left.
 */
async function endSubscriptionsAtPeriodEnd(user: { id: string; stripeCustomerId: string | null }): Promise<BillingOutcome> {
  if (!user.stripeCustomerId) return "none";
  const stripe = getStripeClient();
  if (!stripe) return "unavailable";
  try {
    const { data } = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: "all", limit: 100 });
    const live = data.filter((s) => !ENDED_SUBSCRIPTION.has(s.status));
    for (const subscription of live) {
      if (!subscription.cancel_at_period_end && !subscription.cancel_at) {
        await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
      }
    }
    return live.length > 0 ? "cancelling" : "none";
  } catch (error) {
    if (isMissing(error)) return "none";
    console.error("Deactivation could not stop the subscription", error);
    // The account's ID only: no email or name goes to Sentry.
    Sentry.captureException(error, { tags: { area: "admin-deactivate" }, user: { id: user.id } });
    return "failed";
  }
}

/**
 * The billing webhook's rule for a deactivated account (owner, 25 Nov): a subscription that starts
 * or renews after deactivation, such as from a Checkout opened before it, ends at the period end.
 */
export async function cancelIfDeactivated(
  stripe: Stripe,
  user: { deactivatedAt: Date | null },
  subscription: Pick<Stripe.Subscription, "id" | "status" | "cancel_at_period_end" | "cancel_at">
): Promise<void> {
  if (!user.deactivatedAt || ENDED_SUBSCRIPTION.has(subscription.status)) return;
  if (subscription.cancel_at_period_end || subscription.cancel_at) return;
  await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
}

async function revalidateZinesOf(userId: string) {
  const zines = await prisma.zine.findMany({ where: { ownerId: userId, published: true }, select: { slug: true, owner: { select: { publicId: true } } } });
  await revalidatePublicZines(zines.map((z) => ({ owner: z.owner.publicId, slug: z.slug })));
}

export type AccountRefusal = "self" | "forbidden" | "not_found" | "target_admin";

/**
 * Deactivates the account under the admin lock: refused on yourself and on admins, whose role must
 * be removed first (owner, 25 Nov). Signs out every session and records it, once. Returns whether
 * this call deactivated it.
 */
async function claimDeactivation(actorId: string, targetId: string): Promise<{ changed: boolean } | AccountRefusal> {
  if (actorId === targetId) return "self";
  return prisma.$transaction(async (tx) => {
    await lockAdmins(tx);
    if (!(await isActiveAdmin(tx, actorId))) return "forbidden" as const;
    const target = await tx.user.findUnique({ where: { id: targetId }, select: { role: true, deactivatedAt: true } });
    if (!target) return "not_found" as const;
    if (target.role === "admin") return "target_admin" as const;
    if (target.deactivatedAt) return { changed: false };
    const now = new Date();
    await tx.user.update({ where: { id: targetId }, data: { deactivatedAt: now, sessionsValidAfter: now } });
    await tx.adminAction.create({ data: { actorId, targetId, action: "deactivate" } });
    return { changed: true };
  });
}

/**
 * Deactivates an account (DIG-137): signed out everywhere, no sign-in, zines hidden, and a paid
 * subscription set to end at the period end. Deactivation does not wait on Stripe: it happens even
 * when billing fails, and the outcome says so, so a retry can finish it.
 */
export async function deactivateUser(actorId: string, targetId: string): Promise<{ billing: BillingOutcome } | AccountRefusal> {
  const claim = await claimDeactivation(actorId, targetId);
  if (typeof claim === "string") return claim;
  if (claim.changed) await revalidateZinesOf(targetId);
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, stripeCustomerId: true } });
  return { billing: user ? await endSubscriptionsAtPeriodEnd(user) : "none" };
}

/** Lets the account sign in again and shows its zines. Old sessions stay ended; the subscription is not resumed. */
export async function reactivateUser(actorId: string, targetId: string): Promise<{ ok: true } | AccountRefusal> {
  if (actorId === targetId) return "self";
  const outcome = await prisma.$transaction(async (tx) => {
    await lockAdmins(tx);
    if (!(await isActiveAdmin(tx, actorId))) return "forbidden" as const;
    const target = await tx.user.findUnique({ where: { id: targetId }, select: { role: true, deactivatedAt: true } });
    if (!target) return "not_found" as const;
    if (target.role === "admin") return "target_admin" as const;
    if (!target.deactivatedAt) return "unchanged" as const;
    await tx.user.update({ where: { id: targetId }, data: { deactivatedAt: null } });
    await tx.adminAction.create({ data: { actorId, targetId, action: "reactivate" } });
    return "changed" as const;
  });
  if (outcome === "changed") await revalidateZinesOf(targetId);
  return outcome === "changed" || outcome === "unchanged" ? { ok: true } : outcome;
}

/**
 * Deletes an account for an admin (DIG-137). It is deactivated first, so the person is locked out
 * and cannot be made an admin while the deletion runs; then it goes as DIG-108 deletes your own
 * account. If a step fails the person stays deactivated, and a retry finishes the job.
 */
export async function deleteUserAsAdmin(actorId: string, targetId: string): Promise<{ ok: true } | AccountRefusal | DeletionFailure> {
  const claim = await claimDeactivation(actorId, targetId);
  if (typeof claim === "string") return claim;
  if (claim.changed) await revalidateZinesOf(targetId);
  const result = await deleteAccountCompletely(targetId, { deletedBy: actorId });
  return result.ok ? { ok: true } : result.code;
}
