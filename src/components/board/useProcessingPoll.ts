"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { toBoardAsset, type BoardAsset } from "./types";

export const PROCESSING_POLL_MS = 2000;

/**
 * While any photo is processing, checks the server every few seconds and swaps in the result
 * (DIG-26; moved out of VisionBoard in DIG-47). Only processing photos are touched, so local
 * edits are never overwritten, and only they are fetched, not the whole board (DIG-29).
 */
export function useProcessingPoll(
  boardId: string,
  assets: BoardAsset[],
  setAssets: Dispatch<SetStateAction<BoardAsset[]>>
) {
  const pendingIds = assets
    .filter((a) => a.status === "processing")
    .map((a) => a.id)
    .join(",");
  useEffect(() => {
    if (!pendingIds) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/assets?ids=${encodeURIComponent(pendingIds)}`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const body = (await res.json()) as { assets: Parameters<typeof toBoardAsset>[0][] };
        const fresh = new Map(body.assets.map((raw) => [raw.id, toBoardAsset(raw)]));
        if (stopped) return;
        setAssets((prev) =>
          prev.map((a) => {
            const next = fresh.get(a.id);
            if (a.status !== "processing" || !next || next.status === "processing") return a;
            return {
              ...a,
              status: next.status,
              publicUrl: next.publicUrl,
              sizeBytes: next.sizeBytes,
              processingError: next.processingError,
              blurDataUrl: next.blurDataUrl,
            };
          })
        );
      } catch {
        // Offline for a moment; the next tick tries again.
      }
    }, PROCESSING_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pendingIds, boardId, setAssets]);
}
