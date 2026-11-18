"use client";

import { useEffect } from "react";

export default function PublicZineError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-2xl font-bold text-ink-900">This zine could not load</h1>
      <p className="mt-2 text-sm text-ink-500">
        This is usually a temporary problem. Try again in a moment.
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
        className="mt-5 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800"
      >
        Try again
      </button>
    </main>
  );
}
