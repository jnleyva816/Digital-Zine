import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { listAdminSubscriptions } from "@/lib/admin/admin-subscriptions";
import { StudioHeader } from "@/components/StudioHeader";
import { AdminNav } from "@/components/admin/AdminNav";
import { SubscriptionList } from "@/components/admin/SubscriptionList";

export const metadata: Metadata = {
  title: "Admin · Subscriptions",
  robots: { index: false, follow: false },
};

export default async function AdminSubscriptionsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Fadmin%2Fsubscriptions");
  if (user.role !== "admin") notFound();

  const subscriptions = await listAdminSubscriptions();

  return (
    <>
      <StudioHeader user={{ email: user.email, name: user.name, tier: user.tier, role: user.role, viewingAsFree: user.viewingAsFree }} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="font-serif text-3xl font-bold text-ink-900">Admin</h1>
        <AdminNav current="subscriptions" />
        <p className="mt-4 text-sm text-ink-500">Accounts whose subscription keeps Pro: active, on trial, or retrying a failed payment. Change a subscription in Stripe.</p>
        <div className="mt-5">
          <SubscriptionList initial={subscriptions} />
        </div>
      </main>
    </>
  );
}
