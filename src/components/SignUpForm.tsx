"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, MailCheck } from "lucide-react";
import { PASSWORD_MAX, PASSWORD_MIN, signupSchema } from "@/lib/auth/signup";
import { useResendVerification } from "@/lib/auth/use-resend-verification";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-ink-900 shadow-xs focus:border-vermilion-500 focus:outline-hidden focus:ring-2 focus:ring-vermilion-500/20";
const labelClass = "block font-mono text-xs uppercase tracking-wider text-ink-700";

/** Creates a password account (DIG-94), then asks the creator to verify their email. */
export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { state: resendState, resend } = useResendVerification();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = signupSchema.safeParse({ name, email, password, confirmPassword, acceptTerms });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword, acceptTerms }),
      });
      if (res.status === 201) {
        setSentTo(parsed.data.email);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "We could not create your account. Try again in a moment.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <div className="stack-y-4 text-center">
        <MailCheck className="mx-auto h-8 w-8 text-vermilion-500" aria-hidden="true" />
        <h2 className="font-serif text-xl font-bold text-ink-900">Check your email</h2>
        <p className="text-sm text-ink-700">
          We sent a verification link to <strong className="break-all font-semibold">{sentTo}</strong>. Open it to start your studio. The
          link works once and expires in 24 hours.
        </p>
        <button
          type="button"
          onClick={() => resend(sentTo)}
          disabled={resendState.status === "sending"}
          className="text-sm font-medium text-vermilion-600 underline hover:text-vermilion-500 disabled:opacity-60"
        >
          Resend email
        </button>
        {resendState.status === "sent" ? (
          <p role="status" className="text-xs text-ink-700">
            Sent. Check your email for a new link.
          </p>
        ) : null}
        {resendState.status === "error" ? (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
            {resendState.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="stack-y-5">
      {googleEnabled ? (
        <>
          <GoogleButton callbackUrl="/board" />
          <OrDivider />
        </>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="stack-y-5">
        <div>
          <label htmlFor="name" className={labelClass}>
            Name
          </label>
          <input id="name" name="name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            aria-describedby="password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <p id="password-hint" className="mt-1.5 text-xs text-ink-500">
            {PASSWORD_MIN} to {PASSWORD_MAX} characters.
          </p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className={labelClass}>
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex items-start gap-2.5">
          <input
            id="acceptTerms"
            name="acceptTerms"
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-sm border-paper-300 text-vermilion-500 focus:ring-vermilion-500/30"
          />
          <label htmlFor="acceptTerms" className="text-sm text-ink-700">
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-medium text-vermilion-600 underline hover:text-vermilion-500">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-vermilion-600 underline hover:text-vermilion-500">
              Privacy Policy
            </Link>
            .
          </label>
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800 disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create account"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      <p className="text-center text-sm text-ink-500">
        Already have an account?{" "}
        <Link href="/signin" className="font-medium text-vermilion-600 underline hover:text-vermilion-500">
          Sign in
        </Link>
      </p>
    </div>
  );
}
