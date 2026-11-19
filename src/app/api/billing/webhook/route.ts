import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { decidingSubscription, tierForStatus } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

/**
 * Re-reads the customer's subscriptions from Stripe and stores the plan they add up to. Events can
 * arrive out of order, so the payload's own status is never trusted, and the event's subscription
 * is not assumed to be the current one (DIG-39). Users are found by their linked Stripe customer,
 * never by metadata.
 */
async function syncSubscription(stripe: Stripe, subscriptionId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = idOf(subscription.customer);
  const user = customerId ? await prisma.user.findUnique({ where: { stripeCustomerId: customerId } }) : null;
  if (!user) {
    console.warn(`Stripe webhook: no user for customer ${customerId ?? "(none)"}; subscription ${subscription.id} ignored`);
    return;
  }
  const { data: all } = await stripe.subscriptions.list({ customer: customerId!, status: "all", limit: 10 });
  const current = decidingSubscription([subscription, ...all.filter((s) => s.id !== subscription.id)]) ?? subscription;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      tier: tierForStatus(current.status),
      subscriptionStatus: current.status,
      stripeSubscriptionId: current.id,
    },
  });
}

/** Links the Checkout's customer to the user who started it, if that user has no other customer. */
async function linkCheckoutCustomer(session: Stripe.Checkout.Session) {
  const customerId = idOf(session.customer);
  const userId = session.client_reference_id;
  if (!customerId || !userId) return;
  await prisma.user.updateMany({
    where: { id: userId, OR: [{ stripeCustomerId: null }, { stripeCustomerId: customerId }] },
    data: { stripeCustomerId: customerId },
  });
}

async function handle(stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.mode !== "subscription") return;
      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;
      const subscriptionId = idOf(session.subscription);
      if (!subscriptionId) return;
      await linkCheckoutCustomer(session);
      await syncSubscription(stripe, subscriptionId);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await syncSubscription(stripe, event.data.object.id);
      return;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscriptionId = idOf(event.data.object.parent?.subscription_details?.subscription);
      if (subscriptionId) await syncSubscription(stripe, subscriptionId);
      return;
    }
    default:
      return;
  }
}

export async function POST(req: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhooks are not configured (STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing)." },
      { status: 503 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    await handle(stripe, event);
  } catch (error) {
    // A 5xx makes Stripe retry the event later.
    console.error(`Stripe webhook ${event.type} (${event.id}) failed`, error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
