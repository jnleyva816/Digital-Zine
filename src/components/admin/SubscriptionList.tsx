"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { AdminSubscription, AdminSubscriptionPage } from "@/lib/admin-subscriptions";
import { OFFLINE, badge, focusRing, secondary } from "./styles";

const STATUS: Record<AdminSubscription["status"], string> = { active: "Active", trialing: "Trial", past_due: "Payment failed" };

/** Who is paying, read-only (DIG-139). Any change to a subscription is made in Stripe. */
export function SubscriptionList({ initial }: { initial: AdminSubscriptionPage }) {
  const [subscriptions, setSubscriptions] = useState(initial.subscriptions);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (busy || !cursor) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/subscriptions?${new URLSearchParams({ cursor })}`);
      const body = (await res.json().catch(() => null)) as (AdminSubscriptionPage & { error?: string }) | null;
      if (!res.ok || !body?.subscriptions) {
        setError(body?.error ?? "The list could not load. Try again in a moment.");
        return;
      }
      setSubscriptions((current) => {
        const seen = new Set(current.map((s) => s.userId));
        return [...current, ...body.subscriptions.filter((s) => !seen.has(s.userId))];
      });
      setCursor(body.nextCursor);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {initial.billingConfigured ? null : (
        <p role="note" className="mb-4 rounded-xl border border-paper-300 bg-paper-100 px-3.5 py-2.5 text-sm text-ink-700">
          Billing is not set up in this environment, so there are no links to Stripe. The list shows what the database last recorded.
        </p>
      )}
      {subscriptions.length === 0 ? (
        <p className="rounded-2xl border border-paper-300 bg-white p-6 text-sm text-ink-700">No active subscriptions.</p>
      ) : (
        <ul aria-label="Subscriptions" aria-busy={busy} className="divide-y divide-paper-200 rounded-2xl border border-paper-300 bg-white shadow-sm">
          {subscriptions.map((s) => (
            <li key={s.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
              <div className="min-w-0 flex-1 basis-60">
                <p className="break-all text-sm text-ink-900">{s.email}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={s.status === "past_due" ? "rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-amber-900" : badge}>
                    {STATUS[s.status]}
                  </span>
                  {s.deactivated ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-red-800">Deactivated: ends at period end</span>
                  ) : null}
                </div>
              </div>
              {s.stripeUrl ? (
                <a
                  href={s.stripeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${s.email}’s subscription in Stripe (opens in a new tab)`}
                  className={`${secondary} inline-flex items-center gap-1.5`}
                >
                  Open in Stripe
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className={`mt-3 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 ${focusRing}`}>
          {error}
        </p>
      ) : null}
      {cursor ? (
        <div className="mt-5 text-center">
          <button type="button" disabled={busy} onClick={() => void loadMore()} className={secondary}>
            {busy ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
