"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readApiError } from "@/components/board/types";
import { defaultPdfSettings, withTemplate, type PdfPaper, type PdfSettings, type PdfTemplate } from "@/lib/pdf-settings";

const SAVE_DELAY_MS = 600;

/** A style as it is being chosen. Until there is a template and a paper size there is nothing to save. */
interface Draft {
  /** Its `paper` is only a stand-in until `paper` is chosen. */
  look: PdfSettings | null;
  paper: PdfPaper | null;
  /** Booklet until switched: which export the panel is about, not a style. */
  format: PdfSettings["format"];
}

const complete = ({ look, paper, format }: Draft): PdfSettings | null => (look && paper ? { ...look, paper, format } : null);

/** The zine's PDF style (DIG-71): what is chosen, and saving it as it changes. */
export function usePdfStyle(zineId: string, initial: PdfSettings | null, pageAssetIds: string[]) {
  const [draft, setDraft] = useState<Draft>({ look: initial, paper: initial?.paper ?? null, format: initial?.format ?? "booklet" });
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const pending = useRef<PdfSettings | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onPages = useRef(pageAssetIds);
  onPages.current = pageAssetIds;

  /** Saves what is waiting, one request at a time, newest last. False when it could not be saved. */
  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    if (running.current) return running.current;
    if (!pending.current) return Promise.resolve(true);

    const save = async (settings: PdfSettings): Promise<string | null> => {
      try {
        const res = await fetch(`/api/zines/${encodeURIComponent(zineId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // The server refuses a mini zine photo whose page has since been removed.
          body: JSON.stringify({ pdfSettings: { ...settings, miniPhotos: settings.miniPhotos.filter((id) => onPages.current.includes(id)) } }),
          // A choice made just before leaving the page still arrives.
          keepalive: true,
        });
        return res.ok ? null : await readApiError(res, "Could not save the style.");
      } catch {
        return "Could not reach the server. Check your connection and try again.";
      }
    };

    const run = async () => {
      setStatus("saving");
      setError(null);
      while (pending.current) {
        const settings: PdfSettings = pending.current;
        pending.current = null;
        const problem = await save(settings);
        if (problem) {
          // Kept for the next try, unless something newer is already waiting.
          pending.current ??= settings;
          setError(problem);
          setStatus("idle");
          return false;
        }
      }
      setStatus("saved");
      return true;
    };
    running.current = run().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [zineId]);

  useEffect(() => {
    const onLeave = () => void flush();
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      void flush();
    };
  }, [flush]);

  function change(next: Draft) {
    setDraft(next);
    const settings = complete(next);
    if (!settings) return;
    pending.current = settings;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  return {
    look: draft.look,
    paper: draft.paper,
    format: draft.format,
    /** The style, once there is enough of it to export. */
    settings: complete(draft),
    status,
    error,
    flush,
    pickTemplate: (template: PdfTemplate) =>
      change({ ...draft, look: draft.look ? withTemplate(draft.look, template) : defaultPdfSettings(template, draft.paper ?? "a4") }),
    pickPaper: (paper: PdfPaper) => change({ ...draft, paper }),
    pickFormat: (format: PdfSettings["format"]) => change({ ...draft, format }),
    edit: (part: Partial<PdfSettings>) => {
      if (draft.look) change({ ...draft, look: { ...draft.look, ...part } });
    },
    /** Back to the template's defaults. The paper and everything about the mini zine stay. */
    reset: () => {
      if (!draft.look) return;
      const { template, paper, guides, inkSaver, recipePage, miniPhotos } = draft.look;
      change({ ...draft, look: { ...defaultPdfSettings(template, paper), guides, inkSaver, recipePage, miniPhotos } });
    },
  };
}

export type PdfStyle = ReturnType<typeof usePdfStyle>;
