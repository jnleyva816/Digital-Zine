"use client";

import { Loader2 } from "lucide-react";
import { STAGE_LABEL, type UploadItem } from "./upload-photo";

/** Files being uploaded, each with its stage, or its error and a Dismiss button (DIG-47). */
export function UploadList({ uploads, onDismiss }: { uploads: UploadItem[]; onDismiss: (id: string) => void }) {
  if (uploads.length === 0) return null;
  return (
    <ul aria-label="Uploads" className="space-y-2">
      {uploads.map((u) => (
        <li
          key={u.id}
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
            u.stage === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-paper-300 bg-white text-ink-700"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            {u.stage === "error" ? null : (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-vermilion-500" aria-hidden="true" />
            )}
            <span className="truncate">{u.name}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3 text-xs">
            <span role={u.stage === "error" ? "alert" : undefined}>
              {u.stage === "error" ? u.error : STAGE_LABEL[u.stage]}
            </span>
            {u.stage === "error" ? (
              <button type="button" onClick={() => onDismiss(u.id)} className="font-medium underline underline-offset-2">
                Dismiss
              </button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
