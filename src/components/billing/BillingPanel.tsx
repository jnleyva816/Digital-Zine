"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import { readApiError } from "@/components/board/types";

export interface BillingPanelProps {
  plan: "Free" | "Pro" | "Admin";
  /** An admin previewing the Free view: show the Free page but never start a checkout. */
  previewOnly?: boolean;
  /** Pro is kept while Stripe retries a failed renewal; this shows the warning. */
  paymentFailed: boolean;
  /** False when Stripe keys or the app URL are missing in this environment. */
  configured: boolean;
  /** Set when Stripe Checkout sends the creator back. */
  checkout: "success" | "cancelled" | null;
  /** True when Stripe Tax adds tax on top of the $15 price. */
  taxExclusive: boolean;
  /** When a cancelled Pro plan stops, as an ISO date (DIG-99). Null when it is not ending. */
  endsAt?: string | null;
  /** Leaves the app for Stripe. Injected in tests. */
  navigate?: (url: string) => void;
}

const REFRESH_EVERY_MS = 3000;
const MAX_REFRESHES = 10;

/** "20 December 2026". UTC, so the server and the browser print the same day. */
function formatEndDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function goTo(url: string) {
  window.location.assign(url);
}

export function BillingPanel({
  plan,
  paymentFailed,
  configured,
  checkout,
  taxExclusive,
  endsAt = null,
  previewOnly = false,
  navigate = goTo,
}: BillingPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "checkout" | "portal">(null);
  const [error, setError] = useState<string | null>(null);

  // Checkout returns before Stripe's webhook lands. Re-read the plan a few times until Pro shows.
  const awaitingActivation = checkout === "success" && plan === "Free";
  useEffect(() => {
    if (!awaitingActivation) return;
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= MAX_REFRESHES) clearInterval(timer);
    }, REFRESH_EVERY_MS);
    return () => clearInterval(timer);
  }, [awaitingActivation, router]);

  async function open(kind: "checkout" | "portal") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/billing/${kind}`, { method: "POST" });
      if (!res.ok) {
        setError(
          await readApiError(
            res,
            kind === "checkout" ? "Checkout could not start. Try again in a moment." : "The subscription page could not open."
          )
        );
        setBusy(null);
        return;
      }
      const body = (await res.json()) as { url?: string | null };
      if (!body.url) {
        setError("Stripe did not return a page to open. Try again in a moment.");
        setBusy(null);
        return;
      }
      // Keep the button busy while the browser leaves for Stripe.
      navigate(body.url);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(null);
    }
  }

  let notice: string | null = null;
  if (checkout === "cancelled") notice = "Checkout was cancelled. You have not been charged.";
  else if (checkout === "success" && plan === "Pro") notice = "Welcome to Pro. PDF export is now unlocked.";
  else if (awaitingActivation)
    notice = "Payment received. Activating Pro — this usually takes a few seconds. This page updates on its own.";

  return (
    <div className="stack-y-5">
      {notice ? (
        <p role="status" className="rounded-xl border border-paper-300 bg-paper-100 px-4 py-3 text-sm text-ink-800">
          {notice}
        </p>
      ) : null}

      {plan === "Pro" && endsAt ? (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your Pro plan ends on {formatEndDate(endsAt)}. You keep Pro until then. To keep it, open Manage subscription
          below and renew.
        </p>
      ) : null}

      {paymentFailed ? (
        <p role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Your last payment failed. Update your card to keep Pro. Stripe will retry the charge for a few days before
            your plan returns to Free.
          </span>
        </p>
      ) : null}

      {!configured ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Billing is not set up in this environment, so upgrades and subscription changes are unavailable here.
        </p>
      ) : null}

      <section aria-labelledby="current-plan" className="rounded-2xl border border-paper-300 bg-paper-50 p-5 shadow-xs sm:p-6">
        <h2 id="current-plan" className="font-serif text-xl font-bold text-ink-900">
          Your plan: {plan}
        </h2>
        {plan === "Admin" ? (
          <p className="mt-2 text-sm text-ink-700">
            Full access to every feature, including PDF export. Admin accounts don&apos;t need a subscription. Use
            &ldquo;View as Free&rdquo; in the header to see the app the way a Free user does.
          </p>
        ) : plan === "Pro" ? (
          <>
            <p className="mt-2 text-sm text-ink-700">
              You can export your published zines as PDFs. Change your card, see invoices, or cancel in the subscription
              page Stripe hosts for us.
            </p>
            <button
              type="button"
              onClick={() => void open("portal")}
              disabled={!configured || busy !== null}
              aria-busy={busy === "portal"}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-ink-900 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-paper-200 disabled:border-paper-300 disabled:text-ink-500"
            >
              {busy === "portal" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CreditCard className="h-4 w-4" aria-hidden="true" />
              )}
              {busy === "portal" ? "Opening…" : "Manage subscription"}
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-700">
            Your Vision Board, the zine editor, and public zine pages are free.
          </p>
        )}
      </section>

      {plan === "Free" ? (
        <section aria-labelledby="pro-offer" className="rounded-2xl border-2 border-vermilion-500/70 bg-white p-5 shadow-xs sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="pro-offer" className="inline-flex items-center gap-2 font-serif text-xl font-bold text-ink-900">
              <Sparkles className="h-4 w-4 text-vermilion-500" aria-hidden="true" />
              Pro
            </h2>
            <p className="font-mono text-sm text-ink-800">{taxExclusive ? "$15/month plus applicable tax" : "$15/month"}</p>
          </div>
          <ul className="mt-3 stack-y-1.5 text-sm text-ink-700">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-600" aria-hidden="true" />
              <span>Export your published zines as PDFs</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-600" aria-hidden="true" />
              <span>Cancel anytime from this page</span>
            </li>
          </ul>
          <button
            type="button"
            onClick={() => void open("checkout")}
            disabled={!configured || previewOnly || busy !== null}
            aria-busy={busy === "checkout"}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800 disabled:bg-ink-500 sm:w-auto"
          >
            {busy === "checkout" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy === "checkout" ? "Opening checkout…" : "Upgrade to Pro"}
          </button>
          <p className="mt-2 text-xs text-ink-500">
            {previewOnly
              ? "Preview only: admin accounts can't subscribe."
              : "Payment is handled by Stripe. You can cancel anytime."}
          </p>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
