import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { appOrigin, automaticTaxEnabled, describeSubscription } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
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
  const { plan, paymentFailed } = describeSubscription(user);

  return (
    <>
      <StudioHeader
        user={{ email: user.email, name: user.name, tier: user.tier }}
        activeZineId={latestZine?.id ?? null}
        publishedSlug={latestZine?.published ? latestZine.slug : null}
      />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-ink-900">Billing</h1>
          <p className="mt-1 text-sm text-ink-500">Your plan and subscription.</p>
        </div>
        <BillingPanel
          plan={plan}
          paymentFailed={paymentFailed}
          configured={isStripeConfigured() && appOrigin() !== null}
          checkout={checkout === "success" || checkout === "cancelled" ? checkout : null}
          taxExclusive={automaticTaxEnabled()}
        />
      </main>
    </>
  );
}
