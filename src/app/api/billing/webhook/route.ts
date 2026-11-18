import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

function tierFromSubscriptionStatus(status: string): "free" | "pro" {
  return status === "active" || status === "trialing" ? "pro" : "free";
}

export async function POST(req: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      {
        error:
          "Stripe webhook is not configured (STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing).",
      },
      { status: 503 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId =
      session.metadata?.userId ?? session.client_reference_id ?? null;
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? null;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null;

    if (userId) {
      await prisma.user.updateMany({
        where: { id: userId },
        data: {
          tier: "pro",
          subscriptionStatus: "active",
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        },
      });
    } else if (customerId) {
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          tier: "pro",
          subscriptionStatus: "active",
          ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        },
      });
    }
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const status =
      event.type === "customer.subscription.deleted"
        ? "canceled"
        : subscription.status;
    const tier = tierFromSubscriptionStatus(status);
    const userId = subscription.metadata?.userId ?? null;
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id ?? null;

    if (userId) {
      await prisma.user.updateMany({
        where: { id: userId },
        data: {
          tier,
          subscriptionStatus: status,
          stripeSubscriptionId: subscription.id,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
        },
      });
    } else if (customerId) {
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          tier,
          subscriptionStatus: status,
          stripeSubscriptionId: subscription.id,
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}
