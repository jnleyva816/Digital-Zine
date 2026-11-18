"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, KeyRound } from "lucide-react";
import { safeCallbackUrl } from "@/lib/safe-callback-url";

const DEV_EMAIL = "creator@digitalzine.local";
const DEV_PASSWORD = "zine1234";

interface SignInFormProps {
  /** Show and prefill the seeded dev account. Never true in production builds. */
  showDevCredentials: boolean;
}

export function SignInForm({ showDevCredentials }: SignInFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

  const [email, setEmail] = useState(showDevCredentials ? DEV_EMAIL : "");
  const [password, setPassword] = useState(showDevCredentials ? DEV_PASSWORD : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let res: Awaited<ReturnType<typeof signIn>> | undefined;
    try {
      res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setLoading(false);
      return;
    }

    if (!res || res.error) {
      setError("That email and password did not match an account.");
      setLoading(false);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="email"
          className="block font-mono text-xs uppercase tracking-wider text-ink-700"
        >
          Studio Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block font-mono text-xs uppercase tracking-wider text-ink-700"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
      >
        {loading ? "Opening Studio..." : "Sign in to Studio"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>

      {showDevCredentials ? (
      <div className="rounded-xl border border-paper-300 bg-paper-100 p-3.5 text-xs text-ink-700">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 font-mono uppercase tracking-wider text-ink-800">
            <KeyRound className="h-3.5 w-3.5 text-vermilion-500" aria-hidden="true" />
            Seeded Dev Account
          </span>
          <button
            type="button"
            onClick={() => {
              setEmail(DEV_EMAIL);
              setPassword(DEV_PASSWORD);
            }}
            className="font-medium text-vermilion-600 underline hover:text-vermilion-500"
          >
            Fill defaults
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-ink-500">
          {DEV_EMAIL} / {DEV_PASSWORD}
        </p>
      </div>
      ) : null}
    </form>
  );
}
