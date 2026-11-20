/**
 * Subscription statuses that keep Pro. `past_due` is included on purpose (decided 18 Nov 2026,
 * DIG-11): while Stripe retries a failed renewal the creator keeps Pro, and they drop to Free
 * once Stripe marks the subscription `unpaid` or `canceled`.
 */
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

export function tierForStatus(status: string): "free" | "pro" {
  return PRO_STATUSES.has(status) ? "pro" : "free";
}

/** How good a status is for the creator: active, then trialing, then past due, then anything else. */
const STATUS_RANK: Record<string, number> = { active: 3, trialing: 2, past_due: 1 };

/**
 * The subscription that decides a customer's plan (DIG-39): the best status among all of them,
 * newest first on a tie. A late event for an old, ended subscription therefore cannot downgrade a
 * creator who is paying for a newer one.
 */
export function decidingSubscription<T extends { status: string; created?: number }>(subscriptions: T[]): T | null {
  return (
    [...subscriptions].sort(
      (a, b) => (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0) || (b.created ?? 0) - (a.created ?? 0)
    )[0] ?? null
  );
}

/**
 * Stripe Tax on Checkout (DIG-16). Opt-in per environment because Stripe rejects `automatic_tax`
 * until the account's Tax settings are active. Tax is only collected where the account has an
 * active registration; see the README.
 */
export function automaticTaxEnabled(): boolean {
  return process.env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase() === "true";
}

export function describeSubscription({ tier, subscriptionStatus }: { tier: "free" | "pro"; subscriptionStatus: string }) {
  return {
    plan: tier === "pro" ? ("Pro" as const) : ("Free" as const),
    paymentFailed: tier === "pro" && subscriptionStatus === "past_due",
  };
}

/** The app's public origin for Stripe return URLs. Never derived from the request's Host header. */
export function appOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export const BILLING_NOT_CONFIGURED =
  "Billing is not set up in this environment. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID, and NEXT_PUBLIC_APP_URL to enable Pro subscriptions.";
