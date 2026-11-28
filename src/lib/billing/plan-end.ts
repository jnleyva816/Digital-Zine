import { tierForStatus } from "@/lib/billing/billing";
import { getStripeClient } from "@/lib/billing/stripe";

/** The parts of a Stripe subscription this needs, so tests and Stripe's own type both fit. */
interface EndingSubscription {
  status: string;
  cancel_at?: number | null;
  cancel_at_period_end?: boolean | null;
  items?: { data: { current_period_end?: number | null }[] };
}

/**
 * When a Pro plan that has been cancelled actually stops (DIG-99). A creator who cancels in the
 * Customer Portal keeps Pro until the end of the period they paid for, so the subscription stays
 * active with a future `cancel_at`. Null for a plan that is not ending, or that has already ended.
 */
export function scheduledEnd(subscription: EndingSubscription): Date | null {
  if (tierForStatus(subscription.status) !== "pro") return null;
  const seconds =
    subscription.cancel_at ??
    (subscription.cancel_at_period_end ? (subscription.items?.data[0]?.current_period_end ?? null) : null);
  return seconds ? new Date(seconds * 1000) : null;
}

/**
 * Reads the subscription from Stripe and returns when it ends. Any problem (no subscription,
 * Stripe not set up, Stripe unreachable) gives null, so `/billing` just shows no banner.
 */
export async function fetchPlanEnd(stripeSubscriptionId: string | null | undefined): Promise<Date | null> {
  if (!stripeSubscriptionId) return null;
  const stripe = getStripeClient();
  if (!stripe) return null;
  try {
    return scheduledEnd(await stripe.subscriptions.retrieve(stripeSubscriptionId));
  } catch (error) {
    console.error("Could not read the subscription end date", error);
    return null;
  }
}
