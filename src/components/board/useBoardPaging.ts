"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BOARD_PAGE_SIZE } from "@/lib/board-pages";
import { readApiError, toBoardAsset, type BoardAsset } from "./types";

export interface BoardPagingOptions {
  boardId: string;
  initialCursor: string | null;
  initialTotal: number;
  /** Ids already on screen, so a photo uploaded meanwhile is not added twice. */
  loadedIds: () => Set<string>;
  /** Receives each new page's photos that are not on screen yet. */
  onPage: (added: BoardAsset[]) => void;
}

/**
 * Loads a large board a page at a time (DIG-29; moved out of VisionBoard in DIG-47). The next
 * page loads when the sentinel nears the screen, or from the Load more button.
 */
export function useBoardPaging({ boardId, initialCursor, initialTotal, loadedIds, onPage }: BoardPagingOptions) {
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  // State, not a ref: the end of the list comes and goes with the view, and each one must be watched.
  const [sentinel, sentinelRef] = useState<HTMLDivElement | null>(null);
  const callbacks = useRef({ loadedIds, onPage });
  callbacks.current = { loadedIds, onPage };

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetch(
        `/api/assets?boardId=${encodeURIComponent(boardId)}&limit=${BOARD_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(await readApiError(res, "Could not load more photos."));
      const page = (await res.json()) as { assets: Parameters<typeof toBoardAsset>[0][]; nextCursor: string | null; total: number };
      // A photo uploaded while the rest of the board wasn't loaded is already on screen.
      const have = callbacks.current.loadedIds();
      callbacks.current.onPage(page.assets.map(toBoardAsset).filter((a) => !have.has(a.id)));
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : "Could not load more photos.");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [boardId, cursor]);

  // Load the next page as the end of the list comes near.
  useEffect(() => {
    const el = sentinel;
    if (!el || !cursor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadMore();
    }, { rootMargin: "800px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinel, cursor, loadMore]);

  return { cursor, total, setTotal, loadingMore, loadMoreError, loadMore, sentinelRef };
}
