"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { readApiError } from "@/components/board/types";

type Reload = () => void;
const reloadPage: Reload = () => window.location.reload();

/**
 * Switches an admin between full access and the Free creator's view (DIG-17). It does a full
 * reload rather than `router.refresh()`: the switch changes access on every page, and a refresh
 * can reuse an in-flight prefetch made before the cookie was set (seen as a flaky e2e test).
 */
function useViewAs(reload: Reload) {
  // Server-rendered buttons are visible before React attaches handlers; a click in that gap
  // would do nothing. Keep them disabled until hydrated.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(viewAsFree: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewAsFree }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "The view could not be switched. Try again."));
        setBusy(false);
        return;
      }
      // Stay busy while the page reloads.
      reload();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return { busy: busy || !ready, error, set };
}

export function AdminViewToggle({ viewingAsFree, reload = reloadPage }: { viewingAsFree: boolean; reload?: Reload }) {
  const { busy, error, set } = useViewAs(reload);
  return (
    <div className="relative">
      <button
        type="button"
        role="switch"
        aria-checked={viewingAsFree}
        aria-label="View as Free user"
        disabled={busy}
        onClick={() => void set(!viewingAsFree)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-paper-300 bg-white px-2.5 py-1 lg:min-h-0 text-xs font-medium text-ink-800 transition hover:border-ink-700 disabled:opacity-60"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden lg:inline">View as Free</span>
        <span
          aria-hidden="true"
          className={`relative h-4 w-7 rounded-full transition ${viewingAsFree ? "bg-vermilion-500" : "bg-paper-300"}`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
              viewingAsFree ? "left-3.5" : "left-0.5"
            }`}
          />
        </span>
      </button>
      {error ? (
        <p role="alert" className="absolute right-0 top-full z-40 mt-1 w-64 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 shadow">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AdminViewBanner({ reload = reloadPage }: { reload?: Reload }) {
  const { busy, error, set } = useViewAs(reload);
  return (
    <div className="border-b border-vermilion-500/40 bg-vermilion-500/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-6">
        <p role="status" className="text-ink-800">
          You&apos;re viewing the studio as a Free user. Admin access is paused until you switch back.
        </p>
        <button
          type="button"
          onClick={() => void set(false)}
          disabled={busy}
          className="rounded-full bg-ink-900 px-3 py-1 text-xs font-semibold text-paper-50 transition hover:bg-ink-800 disabled:opacity-60"
        >
          Back to admin view
        </button>
        {error ? (
          <p role="alert" className="w-full text-xs text-red-800">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
