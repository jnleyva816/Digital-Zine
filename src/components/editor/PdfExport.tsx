"use client";

import { useState } from "react";
import { FileDown, Loader2, Palette } from "lucide-react";
import { readApiError } from "@/components/board/types";
import type { PdfSettings } from "@/lib/pdf-settings";
import type { PreviewZine } from "./PdfPagePreview";
import { PdfStylePanel } from "./PdfStylePanel";
import { UpgradePrompt } from "./pdf-panel-ui";
import { usePdfStyle } from "./usePdfStyle";

interface PdfExportProps {
  zineId: string;
  slug: string;
  tier: "free" | "pro";
  /** True when the editor has unsaved changes, which the PDF will not include. */
  dirty: boolean;
  /** The zine's saved style, or null before its first one. */
  settings: PdfSettings | null;
  /** The zine as last saved, which is what the PDF prints. */
  preview: PreviewZine;
  /** Called when the style panel closes. */
  onStyled?: () => void;
}

const quietButton =
  "inline-flex items-center gap-1.5 rounded-xl border border-paper-300 bg-paper-50 px-3.5 py-1.5 text-sm font-medium text-ink-900 shadow-sm transition hover:bg-paper-200 disabled:opacity-60";

/** Every creator can style their published zine's PDF; Pro creators download it, and Free creators see the upgrade path. */
export function PdfExport({ zineId, slug, tier, dirty, settings, preview, onStyled }: PdfExportProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [styling, setStyling] = useState(false);
  const style = usePdfStyle(zineId, settings, preview.pages.map((p) => p.assetId));

  async function download() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      // The server prints the saved style. When saving fails, its own message says why.
      if (!(await style.flush())) return;
      const res = await fetch(`/api/pdf/${encodeURIComponent(slug)}?format=booklet`, { cache: "no-store" });
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
    <>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          {tier === "pro" && style.settings ? (
            <button type="button" onClick={() => void download()} disabled={busy} aria-busy={busy} className={quietButton}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {busy ? "Preparing PDF…" : "Download PDF"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setDone(false);
              setStyling(true);
            }}
            className={quietButton}
          >
            <Palette className="h-3.5 w-3.5" aria-hidden="true" />
            Style your PDF
          </button>
          {tier === "pro" && !style.settings ? <span className="text-xs text-ink-500">Choose a style before your first PDF.</span> : null}
          <span aria-live="polite" className="text-xs text-ink-500">
            {done && !styling ? "PDF downloaded." : ""}
          </span>
        </div>
        {tier === "pro" ? null : <UpgradePrompt />}
        {dirty && tier === "pro" ? (
          <p className="text-xs text-ink-500">The PDF uses the last saved version. Save first to include your changes.</p>
        ) : null}
        {(error || style.error) && !styling ? (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs text-red-800">
            {error ?? style.error}
          </p>
        ) : null}
      </div>
      {styling ? (
        <PdfStylePanel
          style={style}
          zine={preview}
          tier={tier}
          dirty={dirty}
          busy={busy}
          done={done}
          exportError={error}
          onExport={() => void download()}
          onClose={() => {
            setStyling(false);
            void style.flush().then(() => onStyled?.());
          }}
        />
      ) : null}
    </>
  );
}
