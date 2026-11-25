"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, MailCheck } from "lucide-react";
import { forgotPasswordSchema } from "@/lib/password-reset-schema";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20";
const backLink = (
  <Link href="/signin" className="font-medium text-vermilion-600 underline hover:text-vermilion-500">
    Back to sign in
  </Link>
);

/**
 * Asks for a password reset link (DIG-107). Whatever the server answers for a valid address, the
 * page says the same thing, and it never repeats the address back.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSent(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "We could not send the email. Try again in a moment.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto h-8 w-8 text-vermilion-500" aria-hidden="true" />
        <p role="status" className="text-sm text-ink-700">
          If that address has an account, we sent a link.
        </p>
        <p className="text-xs text-ink-500">The link works once and expires in one hour. Check your spam folder if it does not arrive.</p>
        <p className="text-sm">{backLink}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <label htmlFor="email" className="block font-mono text-xs uppercase tracking-wider text-ink-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
      >
        {loading ? "Sending..." : "Send reset link"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>

      <p className="text-center text-sm text-ink-500">{backLink}</p>
    </form>
  );
}
