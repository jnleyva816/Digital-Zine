import { prisma } from "@/lib/prisma";
import { PRO_SUBSCRIPTION_STATUSES } from "@/lib/billing";
import { ADMIN_PAGE_SIZE, writeCursor, type Cursor } from "@/lib/admin-users";

/** One paying account, as the admin panel shows it (DIG-139). Read from our database, not Stripe. */
export interface AdminSubscription {
  userId: string;
  email: string;
  status: (typeof PRO_SUBSCRIPTION_STATUSES)[number];
  /** The account is deactivated, so the subscription ends at the period end (DIG-137). */
  deactivated: boolean;
  /** The subscription in the Stripe Dashboard, or null without a usable key. */
  stripeUrl: string | null;
}

export interface AdminSubscriptionPage {
  subscriptions: AdminSubscription[];
  nextCursor: string | null;
  /** False when this environment has no Stripe key: the list still shows, without links. */
  billingConfigured: boolean;
}

const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]+$/;

/**
 * The Dashboard page of a subscription, in the mode the secret key belongs to: test keys (and
 * sandboxes) open the test Dashboard, live keys the live one. Null for anything else, so a strange
 * id or key never becomes a link.
 */
export function stripeDashboardUrl(subscriptionId: string, key: string | undefined): string | null {
  if (!SUBSCRIPTION_ID.test(subscriptionId)) return null;
  const mode = /^(?:sk|rk)_(test|live)_/.exec(key?.trim() ?? "")?.[1];
  if (!mode) return null;
  return `https://dashboard.stripe.com/${mode === "test" ? "test/" : ""}subscriptions/${subscriptionId}`;
}

/**
 * One page of accounts whose subscription keeps Pro, newest account first: the statuses decided
 * for billing (DIG-11), and only where Stripe's subscription is on record.
 */
export async function listAdminSubscriptions({ cursor = null }: { cursor?: Cursor | null } = {}): Promise<AdminSubscriptionPage> {
  const key = process.env.STRIPE_SECRET_KEY;
  const rows = await prisma.user.findMany({
    where: {
      subscriptionStatus: { in: [...PRO_SUBSCRIPTION_STATUSES] },
      stripeSubscriptionId: { not: null },
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE_SIZE + 1,
    select: { id: true, email: true, subscriptionStatus: true, stripeSubscriptionId: true, deactivatedAt: true, createdAt: true },
  });
  const page = rows.slice(0, ADMIN_PAGE_SIZE);
  return {
    subscriptions: page.map((u) => ({
      userId: u.id,
      email: u.email,
      status: u.subscriptionStatus as AdminSubscription["status"],
      deactivated: u.deactivatedAt !== null,
      stripeUrl: stripeDashboardUrl(u.stripeSubscriptionId!, key),
    })),
    nextCursor: rows.length > ADMIN_PAGE_SIZE ? writeCursor({ at: page[page.length - 1].createdAt, id: page[page.length - 1].id }) : null,
    billingConfigured: Boolean(key?.trim()),
  };
}
