"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { useResendVerification } from "@/lib/auth/use-resend-verification";

/**
 * The page the email link opens (DIG-94). Opening it spends nothing: the creator presses the
 * button, so a mail scanner that fetches the link cannot use up the token.
 */
export function VerifyEmailForm({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState("");
  const { state: resendState, resend } = useResendVerification();

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      const res = await signIn("email-verification", { token, redirect: false });
      if (res?.code === "account_deactivated") {
        setError("This account has been deactivated by an admin, so you cannot sign in.");
        setLoading(false);
        return;
      }
      if (!res || res.error) {
        setFailed(true);
        setError("This link is expired or already used. Ask for a new one below.");
        setLoading(false);
        return;
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setLoading(false);
      return;
    }
    router.push("/board");
    router.refresh();
  }

  return (
    <div className="stack-y-5">
      <button
        type="button"
        onClick={verify}
        disabled={loading || failed}
        aria-busy={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800 disabled:opacity-60"
      >
        <BadgeCheck className="h-4 w-4" aria-hidden="true" />
        {loading ? "Verifying..." : "Verify my email"}
      </button>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {failed ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            resend(email);
          }}
          className="stack-y-3"
        >
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
              className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-ink-900 shadow-xs focus:border-vermilion-500 focus:outline-hidden focus:ring-2 focus:ring-vermilion-500/20"
            />
          </div>
          <button
            type="submit"
            disabled={resendState.status === "sending"}
            className="w-full rounded-xl border border-paper-300 bg-white px-5 py-2.5 text-sm font-semibold text-ink-900 shadow-xs hover:bg-paper-100 disabled:opacity-60"
          >
            Send a new link
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
        </form>
      ) : null}
    </div>
  );
}
