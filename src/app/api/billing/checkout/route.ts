import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripeClient, PRO_MONTHLY_PRICE_CENTS } from "@/lib/stripe";

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({
      configured: false,
      url: null,
      message:
        "Stripe billing is not configured in this environment (STRIPE_SECRET_KEY is unset). Configure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable Pro subscriptions at $15/month.",
    });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(req.url).origin;

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: {
        userId: user.id,
      },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const configuredPriceId = process.env.STRIPE_PRO_PRICE_ID?.trim();

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    metadata: {
      userId: user.id,
    },
    subscription_data: {
      metadata: {
        userId: user.id,
      },
    },
    line_items: configuredPriceId
      ? [{ price: configuredPriceId, quantity: 1 }]
      : [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: PRO_MONTHLY_PRICE_CENTS,
              recurring: {
                interval: "month",
              },
              product_data: {
                name: "Digital Zine Pro",
                description:
                  "Pro creator subscription — unlocks published zine PDF exports ($15/month).",
              },
            },
          },
        ],
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
  });

  return NextResponse.json({
    configured: true,
    url: checkoutSession.url,
  });
}
