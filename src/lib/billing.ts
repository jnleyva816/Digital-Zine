/**
 * Subscription statuses that keep Pro. `past_due` is included on purpose (decided 18 Nov 2026,
 * DIG-11): while Stripe retries a failed renewal the creator keeps Pro, and they drop to Free
 * once Stripe marks the subscription `unpaid` or `canceled`.
 */
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

export function tierForStatus(status: string): "free" | "pro" {
  return PRO_STATUSES.has(status) ? "pro" : "free";
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
