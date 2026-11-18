"use client";

import { useState } from "react";
import Link from "next/link";
import { FileDown, Loader2 } from "lucide-react";
import { readApiError } from "@/components/board/types";

interface PdfExportProps {
  slug: string;
  tier: "free" | "pro";
  /** True when the editor has unsaved changes, which the PDF will not include. */
  dirty: boolean;
}

/** Pro creators download their published zine as a PDF; Free creators see the upgrade path. */
export function PdfExport({ slug, tier, dirty }: PdfExportProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (tier !== "pro") {
    return (
      <p className="text-sm text-ink-500">
        PDF export is a Pro feature.{" "}
        <Link href="/billing" className="font-medium text-vermilion-600 underline underline-offset-2">
          Upgrade to Pro
        </Link>
      </p>
    );
  }

  async function download() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch(`/api/pdf/${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!res.ok) {
        setError(await readApiError(res, "The PDF could not be generated. Try again in a moment."));
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      // Give the browser a moment to start the download before releasing the blob.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void download()}
          disabled={busy}
          aria-busy={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-paper-300 bg-paper-50 px-3.5 py-1.5 text-sm font-medium text-ink-900 shadow-sm transition hover:bg-paper-200 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {busy ? "Preparing PDF…" : "Download PDF"}
        </button>
        <span aria-live="polite" className="text-xs text-ink-500">
          {done ? "PDF downloaded." : ""}
        </span>
      </div>
      {dirty ? (
        <p className="text-xs text-ink-500">The PDF uses the last saved version. Save first to include your changes.</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
