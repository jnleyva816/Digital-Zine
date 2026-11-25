import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/lib/storage";
import { getStripeClient } from "@/lib/stripe";
import { revalidatePublicZines } from "@/lib/public-zine-cache";

/** How recent a sign-in must be to delete an account without the password (DIG-108). */
export const REAUTH_WINDOW_MS = 5 * 60 * 1000;

/** Whether a session that began at `signedInAt` (ms) is within the last five minutes. */
export function isRecentSignIn(signedInAt: unknown, now: number = Date.now()): boolean {
  return typeof signedInAt === "number" && Number.isFinite(signedInAt) && signedInAt <= now && now - signedInAt <= REAUTH_WINDOW_MS;
}

export type DeletionFailure = "stripe_failed" | "billing_unavailable" | "storage_failed" | "last_admin" | "failed";
export type DeletionResult = { ok: true } | { ok: false; code: DeletionFailure; message: string };

const ENDED_SUBSCRIPTION = new Set(["canceled", "incomplete_expired"]);

/** Billing is needed to cancel a subscription, but is not set up here. */
class BillingUnavailableError extends Error {}

const isMissing = (error: unknown) => (error as { code?: unknown } | null)?.code === "resource_missing";

/**
 * Ends every live subscription the creator has, at once, and then deletes their Stripe customer,
 * so no saved card or contact details stay there. `cancel` with no options does not prorate or
 * refund; refunds are a separate decision (DIG-15). Stripe keeps its own payment records as the law
 * requires, which the Privacy Policy says. Safe to repeat: an ended subscription is skipped, and a
 * customer or subscription Stripe no longer knows has nothing left to do. Returns how many
 * subscriptions it cancelled now.
 */
async function cancelSubscriptions(user: { stripeCustomerId: string | null; stripeSubscriptionId: string | null }): Promise<number> {
  if (!user.stripeCustomerId && !user.stripeSubscriptionId) return 0;
  const stripe = getStripeClient();
  if (!stripe) throw new BillingUnavailableError();

  const live = new Set<string>();
  if (user.stripeCustomerId) {
    try {
      const { data } = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: "all", limit: 100 });
      for (const subscription of data) if (!ENDED_SUBSCRIPTION.has(subscription.status)) live.add(subscription.id);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  } else if (user.stripeSubscriptionId) {
    live.add(user.stripeSubscriptionId);
  }

  let cancelled = 0;
  for (const id of live) {
    try {
      await stripe.subscriptions.cancel(id);
      cancelled++;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  if (user.stripeCustomerId) {
    try {
      await stripe.customers.del(user.stripeCustomerId);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return cancelled;
}

function report(error: unknown, step: "stripe" | "storage" | "database", userId: string) {
  console.error(`Account deletion failed at ${step}`, error);
  // The account's ID only: no email or name goes to Sentry.
  Sentry.captureException(error, { tags: { area: "account-deletion", step }, user: { id: userId } });
}

const LAST_ADMIN = {
  ok: false,
  code: "last_admin",
  message: "You are the only admin, so this account cannot be deleted. Make someone else an admin first.",
} as const;

/**
 * Deletes an account and everything it owns (DIG-108), in an order that can be repeated: Stripe
 * first, then the stored files, then the database row, whose cascades remove the boards, photos,
 * zines, and recipes. A failure at any step stops there with the account still in place, tells
 * the owner through Sentry, and tells the creator to try again; a retry skips what is already
 * done. Published zines leave the sitemap with the row, and their cached pages are dropped.
 */
export async function deleteAccountCompletely(userId: string): Promise<DeletionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  // Already gone: a retry of a job that had finished.
  if (!user) return { ok: true };

  if (user.role === "admin" && (await prisma.user.count({ where: { role: "admin", id: { not: user.id } } })) === 0) return LAST_ADMIN;

  let cancelled = 0;
  try {
    cancelled = await cancelSubscriptions(user);
  } catch (error) {
    if (error instanceof BillingUnavailableError) {
      return {
        ok: false,
        code: "billing_unavailable",
        message: "Billing is not available right now, so your subscription cannot be cancelled and nothing was deleted. Try again later.",
      };
    }
    report(error, "stripe", user.id);
    return { ok: false, code: "stripe_failed", message: "We could not cancel your subscription, so nothing was deleted. Try again in a moment." };
  }

  try {
    await getStorageDriver().deletePrefix(`users/${user.id}`);
  } catch (error) {
    report(error, "storage", user.id);
    return {
      ok: false,
      code: "storage_failed",
      message: `${cancelled > 0 ? "Your subscription was cancelled. " : ""}We could not remove all of your files, so your account is still here. Try again to finish.`,
    };
  }

  const published = await prisma.zine.findMany({
    where: { ownerId: user.id, published: true },
    select: { slug: true, owner: { select: { publicId: true } } },
  });
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      if (user.role === "admin") {
        // Two admins deleting themselves together must not both pass the check above.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('dz-last-admin'))`;
        if ((await tx.user.count({ where: { role: "admin", id: { not: user.id } } })) === 0) return "last_admin" as const;
      }
      await tx.user.delete({ where: { id: user.id } });
      return "deleted" as const;
    });
    if (outcome === "last_admin") return LAST_ADMIN;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== "P2025") {
      report(error, "database", user.id);
      return { ok: false, code: "failed", message: "We could not delete your account. Try again in a moment." };
    }
  }

  await revalidatePublicZines(published.map((z) => ({ owner: z.owner.publicId, slug: z.slug })));
  return { ok: true };
}
