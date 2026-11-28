"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { readApiError } from "@/components/board/types";

/**
 * The code form on a private zine's page (DIG-112). A right code sets the unlock cookie, and the
 * refresh renders the zine on the server; nothing about the zine is sent to the browser before.
 */
export function UnlockZineForm({ owner, slug }: { owner: string; slug: string }) {
  const router = useRouter();
  const id = useId();
  const [code, setCode] = useState("");
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/z/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Could not open the zine."));
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 stack-y-3">
      <label htmlFor={`${id}-code`} className="block font-mono text-xs uppercase tracking-wider text-ink-700">
        Access code
      </label>
      <input
        id={`${id}-code`}
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={missing}
        aria-describedby={missing ? `${id}-missing` : undefined}
        className="w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2 text-base text-ink-900 shadow-xs focus:border-vermilion-500 focus:outline-hidden focus:ring-2 focus:ring-vermilion-500/20"
      />
      {missing ? (
        <p id={`${id}-missing`} className="text-sm text-vermilion-600">
          Enter the code the creator gave you.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-vermilion-600">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800 disabled:opacity-60"
      >
        {busy ? "Opening…" : "Open zine"}
      </button>
    </form>
  );
}
