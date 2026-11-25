"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { resetPasswordSchema } from "@/lib/password-reset-schema";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20";
const labelClass = "block font-mono text-xs uppercase tracking-wider text-ink-700";
const alertClass = "rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800";
const linkClass = "font-medium text-vermilion-600 underline hover:text-vermilion-500";

/**
 * Chooses a new password from a reset link (DIG-107). Opening the page spends nothing; this form
 * does. On success the creator is signed in with the password they just set.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = resetPasswordSchema.safeParse({ token, password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; email?: string; error?: string; code?: string } | null;

      if (res.ok && body?.email) {
        const signedIn = await signIn("credentials", { email: body.email, password, redirect: false });
        if (!signedIn || signedIn.error) {
          setSignInFailed(true);
          setError("Your password was changed, but we could not sign you in. Sign in with your new password.");
          return;
        }
        router.push("/board");
        router.refresh();
        return;
      }

      if (body?.code === "invalid_token") setExpired(true);
      setError(body?.error ?? "We could not change your password. Try again in a moment.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (expired || signInFailed) {
    return (
      <div className="space-y-4">
        {error ? (
          <p role="alert" className={alertClass}>
            {error}
          </p>
        ) : null}
        <p className="text-sm">
          {expired ? (
            <Link href="/forgot-password" className={linkClass}>
              Ask for a new link
            </Link>
          ) : (
            <Link href="/signin" className={linkClass}>
              Sign in
            </Link>
          )}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="password" className={labelClass}>
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="confirmPassword" className={labelClass}>
          Confirm new password
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

      {error ? (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
      >
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        {loading ? "Saving..." : "Set new password"}
      </button>
    </form>
  );
}
