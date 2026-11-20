import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { appOrigin, automaticTaxEnabled, describeSubscription } from "@/lib/billing";
import { publicZinePath } from "@/lib/public-zine-path";
import { prisma } from "@/lib/prisma";
import { fetchPlanEnd } from "@/lib/plan-end";
import { isStripeConfigured } from "@/lib/stripe";
import { StudioHeader } from "@/components/StudioHeader";
import { BillingPanel } from "@/components/billing/BillingPanel";

export const metadata: Metadata = {
  title: "Billing",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ checkout?: string | string[] }> };

export default async function BillingPage({ searchParams }: Props) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Fbilling");

  const { checkout } = await searchParams;
  const latestZine = await prisma.zine.findFirst({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, published: true },
  });
  // Admins have full access and no subscription; viewing as Free shows the Free page as a preview.
  const isAdmin = user.role === "admin";
  const billed = describeSubscription({ tier: user.billingTier, subscriptionStatus: user.subscriptionStatus });
  const plan = isAdmin ? (user.viewingAsFree ? "Free" : "Admin") : billed.plan;
  const paymentFailed = !isAdmin && billed.paymentFailed;
  // A creator who cancelled keeps Pro until the paid period ends; say when (DIG-99).
  const subscription = !isAdmin && billed.plan === "Pro"
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { stripeSubscriptionId: true } })
    : null;
  const endsAt = (await fetchPlanEnd(subscription?.stripeSubscriptionId))?.toISOString() ?? null;

  return (
    <>
      <StudioHeader
        user={{ email: user.email, name: user.name, tier: user.tier, role: user.role, viewingAsFree: user.viewingAsFree }}
        activeZineId={latestZine?.id ?? null}
        publishedPath={latestZine?.published ? publicZinePath(user.publicId, latestZine.slug) : null}
      />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-ink-900">Billing</h1>
          <p className="mt-1 text-sm text-ink-500">Your plan and subscription.</p>
        </div>
        <BillingPanel
          plan={plan}
          previewOnly={isAdmin}
          paymentFailed={paymentFailed}
          configured={isStripeConfigured() && appOrigin() !== null}
          checkout={checkout === "success" || checkout === "cancelled" ? checkout : null}
          taxExclusive={automaticTaxEnabled()}
          endsAt={endsAt}
        />
      </main>
    </>
  );
}
