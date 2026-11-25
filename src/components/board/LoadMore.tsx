"use client";

import type { Ref } from "react";
import { Loader2 } from "lucide-react";

export interface LoadMoreProps {
  sentinelRef: Ref<HTMLDivElement>;
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
}

/** The end of a paged board: loads the next page, shows progress, and reports a failure (DIG-47). */
export function LoadMore({ sentinelRef, loading, error, onLoadMore }: LoadMoreProps) {
  return (
    <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-4">
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex items-center gap-2 rounded-xl border border-paper-300 bg-white px-5 py-2.5 text-sm font-medium text-ink-800 shadow-xs transition hover:bg-paper-100 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {loading ? "Loading…" : "Load more photos"}
      </button>
    </div>
  );
}
