"use client";

import { useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { MASONRY_GAP, masonryColumns, packMasonry } from "@/lib/board/masonry";
import { DEFAULT_EDIT, frameLayout } from "@/lib/board/photo-edit";
import type { BoardAsset } from "./types";

/** A card's caption, until the card has been measured. */
const CAPTION = 58;

/**
 * Places the grid's cards in masonry columns (DIG-90). Cards stay in the page in board order; only
 * their positions are worked out here, from their real heights. Until the list has been measured
 * there is nothing to place, and the cards follow the plain grid.
 */
export function useMasonry(enabled: boolean, assets: BoardAsset[]) {
  // State, not a ref: the list comes and goes with the view.
  const [list, listRef] = useState<HTMLOListElement | null>(null);
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const ids = assets.map((a) => a.id).join();

  useLayoutEffect(() => {
    if (!list || !enabled) return;
    const measure = () => {
      setWidth(list.clientWidth);
      const found = new Map<string, number>();
      for (const card of list.children) if (card instanceof HTMLElement && card.dataset.assetId) found.set(card.dataset.assetId, card.offsetHeight);
      setHeights((prev) => (prev.size === found.size && [...found].every(([id, h]) => prev.get(id) === h) ? prev : found));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const card of list.children) observer.observe(card);
    return () => observer.disconnect();
  }, [list, enabled, ids]);

  const columns = masonryColumns(width);
  const packed = useMemo(() => {
    if (!enabled || width === 0) return null;
    const column = (width - MASONRY_GAP * (columns - 1)) / columns;
    return packMasonry(
      assets.map((a) => {
        const span = a.edit?.cardSize === "large" ? 2 : 1;
        const dims = a.width && a.height ? { width: a.width, height: a.height } : null;
        return { span, height: heights.get(a.id) || (column * span) / frameLayout(a.edit ?? DEFAULT_EDIT, dims).aspect + CAPTION };
      }),
      { width, columns }
    );
  }, [enabled, width, columns, assets, heights]);

  return {
    list,
    listRef,
    columns,
    listStyle: packed ? ({ display: "block", position: "relative", height: packed.height } satisfies CSSProperties) : undefined,
    cardStyle: (index: number): CSSProperties | undefined => (packed ? { position: "absolute", ...packed.cards[index] } : undefined),
  };
}
