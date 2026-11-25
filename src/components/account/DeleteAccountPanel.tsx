"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Trash2 } from "lucide-react";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-ink-900 shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20";
const labelClass = "block font-mono text-xs uppercase tracking-wider text-ink-700";

interface DeleteAccountPanelProps {
  email: string;
  /** The account has a password, which can stand in for a recent sign-in. */
  hasPassword: boolean;
  /** The session began within the last five minutes. */
  recentSignIn: boolean;
  /** The account has a Pro subscription that deleting would cancel. */
  subscribed: boolean;
}

/**
 * The "Delete account" section (DIG-108). It says exactly what goes before it asks for anything,
 * then asks for the email typed out and a re-check: the password, or for a Google account a
 * sign-in from the last five minutes.
 */
export function DeleteAccountPanel({ email, hasPassword, recentSignIn, subscribed }: DeleteAccountPanelProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  const needsSignIn = !hasPassword && !recentSignIn;
  const emailMatches = typed.trim().toLowerCase() === email.toLowerCase();
  const ready = emailMatches && (!hasPassword || password.length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hasPassword ? { email: typed, password } : { email: typed }),
      });
      if (res.ok) {
        // The account is gone, so the session cookie is worthless; clear it without a redirect.
        await signOut({ redirect: false }).catch(() => undefined);
        setDeleted(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "We could not delete your account. Try again in a moment.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (deleted) {
    return (
      <section className="rounded-2xl border border-paper-300 bg-white p-6 shadow-sm">
        <p role="status" className="font-serif text-lg font-bold text-ink-900">
          Your account has been deleted.
        </p>
        <p className="mt-2 text-sm text-ink-700">Your photos, zines, and recipes are gone. Thank you for using Folio.</p>
        <p className="mt-4 text-sm">
          <Link href="/" className="font-medium text-vermilion-600 underline hover:text-vermilion-500">
            Back to the home page
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="delete-account-heading" className="rounded-2xl border border-red-300 bg-white p-6 shadow-sm">
      <h2 id="delete-account-heading" className="font-serif text-xl font-bold text-ink-900">
        Delete account
      </h2>
      <p className="mt-2 text-sm text-ink-700">Deleting your account permanently removes:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
        <li>Your Vision Boards and photos, and every stored copy of them.</li>
        <li>Your zines. Published zines stop working at once, and their links show a not-found page.</li>
        <li>Your saved recipes.</li>
        <li>Your account and sign-in. You can sign up again later with the same email, with nothing carried over.</li>
      </ul>
      {subscribed ? (
        <p className="mt-3 text-sm text-ink-700">
          Your Pro subscription is cancelled immediately, with no refund, and your saved payment details are removed from Stripe.
        </p>
      ) : null}
      <p className="mt-3 text-sm text-ink-700">
        Payment records may be kept by Stripe as the law requires. <strong className="font-semibold">This cannot be undone.</strong>
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete my account…
        </button>
      ) : needsSignIn ? (
        <div className="mt-5 space-y-3 rounded-xl border border-paper-300 bg-paper-100 p-4">
          <p className="text-sm text-ink-700">
            For your security, sign in with Google once more, then come back here within five minutes to finish.
          </p>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/signin?callbackUrl=%2Faccount" })}
            className="rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-paper-50 shadow-sm hover:bg-ink-800"
          >
            Sign in again
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate aria-label="Confirm account deletion" className="mt-5 space-y-4">
          <div>
            <label htmlFor="confirm-email" className={labelClass}>
              Type your email address to confirm
            </label>
            <input
              id="confirm-email"
              name="confirm-email"
              type="email"
              autoComplete="off"
              placeholder={email}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className={inputClass}
            />
          </div>
          {hasPassword ? (
            <div>
              <label htmlFor="confirm-password" className={labelClass}>
                Your password
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!ready || loading}
              aria-busy={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {loading ? "Deleting..." : "Permanently delete my account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
                setTyped("");
                setPassword("");
              }}
              disabled={loading}
              className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 shadow-sm hover:bg-paper-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
