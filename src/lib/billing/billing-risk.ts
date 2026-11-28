import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/**
 * What the webhook does when money is at risk (DIG-15). The owner decided on 20 Nov 2026:
 *  - a full refund of a subscription's latest payment cancels the subscription at once (Free);
 *  - a dispute and an early fraud warning change nothing for the creator, and only alert the owner.
 * Every event is reported to Sentry. The reports carry Stripe IDs, amounts, and our own user ID,
 * and never an email or a name.
 */

const ENDED = new Set<string>(["canceled", "incomplete_expired"]);

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));

/** Re-reads a subscription from Stripe and stores the plan it adds up to. Passed in by the webhook. */
export type SyncSubscription = (stripe: Stripe, subscriptionId: string) => Promise<void>;

/** The account linked to a Stripe customer. Only the link counts, never metadata (DIG-39). */
async function userIdForCustomer(customer: string | { id: string } | null | undefined): Promise<string | null> {
  const customerId = idOf(customer);
  if (!customerId) return null;
  const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  return user?.id ?? null;
}

/** A charge as an object, whether the event carried it whole or only its ID. Null if it cannot be read. */
async function readCharge(stripe: Stripe, charge: string | Stripe.Charge | null | undefined): Promise<Stripe.Charge | null> {
  if (charge && typeof charge === "object") return charge;
  if (!charge) return null;
  try {
    return await stripe.charges.retrieve(charge);
  } catch (error) {
    console.error(`Stripe risk event: could not read charge ${charge}`, error);
    return null;
  }
}

/**
 * The subscription a charge paid for, by Stripe's object graph: the charge's payment intent, the
 * invoice that payment settled, and that invoice's subscription. Null for a charge that paid for no
 * subscription. (A charge no longer names its invoice in Stripe's current API.)
 */
async function subscriptionForCharge(stripe: Stripe, charge: Stripe.Charge): Promise<{ invoiceId: string; subscriptionId: string } | null> {
  const paymentIntent = idOf(charge.payment_intent);
  if (!paymentIntent) return null;
  const { data } = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: paymentIntent }, limit: 1 });
  const invoiceId = idOf(data[0]?.invoice);
  if (!invoiceId) return null;
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  return subscriptionId ? { invoiceId, subscriptionId } : null;
}

/** A full refund of the latest payment cancels the subscription; any other refund is only reported. */
export async function handleRefund(stripe: Stripe, charge: Stripe.Charge, sync: SyncSubscription): Promise<void> {
  const userId = await userIdForCustomer(charge.customer);
  let subscriptionId: string | null = null;
  let action: string;

  if (!userId) {
    action = "none: no account for this customer";
  } else if (!charge.refunded) {
    action = "none: a partial refund";
  } else {
    const paid = await subscriptionForCharge(stripe, charge);
    if (!paid) {
      action = "none: not a subscription payment";
    } else {
      subscriptionId = paid.subscriptionId;
      const subscription = await stripe.subscriptions.retrieve(paid.subscriptionId);
      if (ENDED.has(subscription.status)) {
        // Already over (a repeated event, or cancelled by hand): make sure the account says so too.
        await sync(stripe, paid.subscriptionId);
        action = "none: subscription already ended";
      } else if (idOf(subscription.latest_invoice) !== paid.invoiceId) {
        action = "none: not the latest payment";
      } else {
        await stripe.subscriptions.cancel(paid.subscriptionId);
        await sync(stripe, paid.subscriptionId);
        action = "cancelled the subscription";
      }
    }
  }

  Sentry.captureMessage("Stripe refund", {
    level: "warning",
    tags: { area: "stripe-risk", event: "refund" },
    extra: { chargeId: charge.id, amount: charge.amount, amountRefunded: charge.amount_refunded, currency: charge.currency, userId, subscriptionId, action },
  });
}

/** A dispute changes nothing for the creator; the owner is told, and decides in Stripe. */
export async function handleDispute(stripe: Stripe, dispute: Stripe.Dispute): Promise<void> {
  const charge = await readCharge(stripe, dispute.charge);
  Sentry.captureMessage("Stripe dispute opened", {
    level: "error",
    tags: { area: "stripe-risk", event: "dispute" },
    extra: {
      disputeId: dispute.id,
      chargeId: idOf(dispute.charge),
      amount: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
      userId: charge ? await userIdForCustomer(charge.customer) : null,
      action: "none: kept Pro",
    },
  });
}

/** An early fraud warning changes nothing for the creator; the owner is told, and decides in Stripe. */
export async function handleFraudWarning(stripe: Stripe, warning: Stripe.Radar.EarlyFraudWarning): Promise<void> {
  const charge = await readCharge(stripe, warning.charge);
  Sentry.captureMessage("Stripe early fraud warning", {
    level: "warning",
    tags: { area: "stripe-risk", event: "fraud-warning" },
    extra: {
      warningId: warning.id,
      chargeId: idOf(warning.charge),
      fraudType: warning.fraud_type,
      actionable: warning.actionable,
      userId: charge ? await userIdForCustomer(charge.customer) : null,
      action: "none: alert only",
    },
  });
}
