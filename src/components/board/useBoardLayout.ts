"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Placement } from "@/lib/board-layout";

/**
 * A board's free-form layout (DIG-87): what is placed where, and saving it. Changes show at once and
 * are saved in the background, one request at a time, so an older position can never land after a
 * newer one. A failed save keeps the local layout and can be retried, unless it can never succeed
 * because something in it is gone: then the saved layout is loaded again.
 */
export function useBoardLayout(boardId: string, initial: Placement[], onReload: () => void) {
  const [placements, setPlacements] = useState<Placement[]>(initial);
  const [saveFailed, setSaveFailed] = useState(false);
  /** Goes up after each save, for anything that reads the server's copy. */
  const [savedCount, setSavedCount] = useState(0);
  const current = useRef(placements);
  const pending = useRef(new Map<string, Placement | null>());
  const saving = useRef(false);
  const reloaded = useRef(onReload);
  reloaded.current = onReload;

  const show = useCallback((next: Placement[]) => {
    current.current = next;
    setPlacements(next);
  }, []);

  const flush = useCallback(async () => {
    if (saving.current || pending.current.size === 0) return;
    saving.current = true;
    const batch = new Map(pending.current);
    let ok = false;
    let reload = false;
    const url = `/api/boards/${encodeURIComponent(boardId)}/layout`;
    try {
      const changed = [...batch].filter((e): e is [string, Placement] => e[1] !== null).map(([, p]) => p);
      const removed = [...batch].filter(([, p]) => p === null).map(([id]) => id);
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements: changed, removed }),
      });
      ok = res.ok;
      if (res.status === 404) {
        const fresh = await fetch(url, { cache: "no-store" });
        if (fresh.ok) {
          const layout = (await fresh.json()) as { placements: Placement[] };
          pending.current.clear();
          show(layout.placements);
          ok = reload = true;
        }
      }
    } catch {
      // Offline: kept, and retried.
    }
    saving.current = false;
    setSaveFailed(!ok);
    if (!ok) return;
    for (const [id, p] of batch) if (pending.current.get(id) === p) pending.current.delete(id);
    setSavedCount((n) => n + 1);
    if (reload) reloaded.current();
    void flush();
  }, [boardId, show]);

  /** Applies and saves changes, and takes photos off the board. */
  const commit = useCallback(
    (changed: Placement[], removed: string[] = []) => {
      const gone = new Set(removed);
      const byId = new Map(changed.map((p) => [p.assetId, p]));
      const kept = current.current.filter((p) => !gone.has(p.assetId)).map((p) => byId.get(p.assetId) ?? p);
      const have = new Set(kept.map((p) => p.assetId));
      show([...kept, ...changed.filter((p) => !have.has(p.assetId))]);
      for (const p of changed) pending.current.set(p.assetId, p);
      for (const id of removed) pending.current.set(id, null);
      void flush();
    },
    [flush, show]
  );

  /** Drops a photo that was deleted or moved to another board; the server has already done the same. */
  const forget = useCallback(
    (assetId: string) => {
      pending.current.delete(assetId);
      show(current.current.filter((p) => p.assetId !== assetId));
    },
    [show]
  );

  // Warn before leaving with a layout that has not been saved.
  useEffect(() => {
    if (!saveFailed) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveFailed]);

  return { placements, commit, forget, saveFailed, retry: flush, savedCount };
}
