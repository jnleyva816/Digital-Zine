import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { appOrigin, BILLING_NOT_CONFIGURED } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

/** Opens Stripe's hosted Customer Portal, where subscribers cancel, update cards, and see invoices. */
export async function POST(_req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to manage billing." }, { status: 401 });
  }

  const stripe = getStripeClient();
  const origin = appOrigin();
  if (!stripe || !origin) {
    return NextResponse.json({ configured: false, url: null, error: BILLING_NOT_CONFIGURED }, { status: 503 });
  }

  if (!user.stripeCustomerId) {
    return NextResponse.json({ error: "There is no subscription to manage yet." }, { status: 409 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/billing`,
    });
    return NextResponse.json({ configured: true, url: session.url });
  } catch (error) {
    console.error("Stripe portal session failed", error);
    return NextResponse.json(
      { error: "The subscription page could not open. Try again in a moment." },
      { status: 502 }
    );
  }
}
