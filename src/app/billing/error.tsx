"use client";

import { useEffect } from "react";

export default function BillingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Billing could not load</h1>
      <p className="mt-2 text-sm text-ink-500">
        Your plan has not changed. This is usually a temporary problem reaching the database.
        {error.digest ? (
          <>
            {" "}
            Reference: <span className="font-mono">{error.digest}</span>
          </>
        ) : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800"
      >
        Try again
      </button>
    </main>
  );
}
