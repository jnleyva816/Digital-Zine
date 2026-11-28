import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { appOrigin, automaticTaxEnabled, BILLING_NOT_CONFIGURED, tierForStatus } from "@/lib/billing/billing";
import { prisma } from "@/lib/prisma";
import { getStripeClient, PRO_MONTHLY_PRICE_CENTS } from "@/lib/billing/stripe";

export const runtime = "nodejs";

export async function POST(_req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to upgrade." }, { status: 401 });
  }

  const stripe = getStripeClient();
  const origin = appOrigin();
  if (!stripe || !origin) {
    return NextResponse.json({ configured: false, url: null, error: BILLING_NOT_CONFIGURED }, { status: 503 });
  }

  if (user.role === "admin") {
    return NextResponse.json(
      { error: "Admin accounts have full access and can't subscribe. Use \"View as Free\" only to preview." },
      { status: 409 }
    );
  }

  if (user.tier === "pro") {
    return NextResponse.json(
      { error: "You already have Pro. Use Manage subscription to change or cancel it." },
      { status: 409 }
    );
  }

  try {
    // Stripe is the source of truth: a second tab, or a webhook that has not arrived yet, can leave
    // the app showing Free while the customer already pays (DIG-39).
    if (user.stripeCustomerId) {
      const { data } = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: "all", limit: 10 });
      if (data.some((s) => tierForStatus(s.status) === "pro")) {
        return NextResponse.json(
          { error: "You already have Pro. Use Manage subscription to change or cancel it." },
          { status: 409 }
        );
      }
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      // The idempotency key stops a double click from creating two customers.
      const customer = await stripe.customers.create(
        { email: user.email, name: user.name ?? undefined, metadata: { userId: user.id } },
        { idempotencyKey: `customer-create-${user.id}` }
      );
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const priceId = process.env.STRIPE_PRO_PRICE_ID?.trim();
    // Tax needs the customer's address. The customer was created without one, so Checkout
    // collects it and saves it back to the customer.
    const tax = automaticTaxEnabled()
      ? ({
          automatic_tax: { enabled: true },
          billing_address_collection: "required",
          customer_update: { address: "auto", name: "auto" },
        } as const)
      : {};
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      metadata: { userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: PRO_MONTHLY_PRICE_CENTS,
                recurring: { interval: "month" },
                // $15 plus applicable tax (decided 18 Nov 2026, DIG-16).
                tax_behavior: "exclusive",
                product_data: {
                  name: "Digital Zine Pro",
                  description: "Export your published zines as PDFs ($15/month).",
                },
              },
            },
          ],
      ...tax,
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
    });

    return NextResponse.json({ configured: true, url: session.url });
  } catch (error) {
    console.error("Stripe checkout failed", error);
    return NextResponse.json({ error: "Checkout could not start. Try again in a moment." }, { status: 502 });
  }
}
