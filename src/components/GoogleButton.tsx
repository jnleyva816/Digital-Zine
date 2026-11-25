"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/** "Continue with Google" for sign-in and sign-up (DIG-94). Shown only when Google is set up. */
export function GoogleButton({ callbackUrl = "/board" }: { callbackUrl?: string }) {
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={loading}
      aria-busy={loading}
      className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-paper-300 bg-white px-5 py-3 text-sm font-semibold text-ink-900 shadow-xs transition hover:bg-paper-100 disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.32z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.68l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.17v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.17a11 11 0 0 0 0 9.86l3.67-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.17 7.07l3.67 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
      {loading ? "Opening Google..." : "Continue with Google"}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-ink-500" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-paper-300" />
      or
      <span className="h-px flex-1 bg-paper-300" />
    </div>
  );
}
