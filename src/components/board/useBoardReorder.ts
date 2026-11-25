"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { assetLabel, moveItem } from "./board-utils";
import { readApiError, type BoardAsset } from "./types";

export interface BoardReorderOptions {
  assets: BoardAsset[];
  setAssets: Dispatch<SetStateAction<BoardAsset[]>>;
  onAnnounce: (message: string) => void;
  /** Reports a failed save (the order is put back), or null to clear an earlier error. */
  onError: (message: string | null) => void;
}

/**
 * Reordering by arrow buttons, keyboard, or drag and drop (DIG-47, moved out of VisionBoard). The new order
 * shows at once and is saved; if the save fails, the previous order comes back with an error.
 */
export function useBoardReorder({ assets, setAssets, onAnnounce, onError }: BoardReorderOptions) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // Drag handlers read refs: drag events can fire before React re-renders with new state.
  const dragIdRef = useRef<string | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  /** The photo picked up from the keyboard (DIG-90), and where it came from. */
  const [held, setHeld] = useState<{ id: string; from: number } | null>(null);

  async function persistOrder(next: BoardAsset[], previous: BoardAsset[], message: string) {
    setAssets(next);
    onError(null);
    try {
      const res = await fetch("/api/assets/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((a) => a.id) }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not save the new order."));
      onAnnounce(message);
    } catch (err) {
      setAssets(previous);
      onError(err instanceof Error ? err.message : "Could not save the new order.");
    }
  }

  function moveBy(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= assets.length) return;
    void persistOrder(
      moveItem(assets, index, target),
      assets,
      `${assetLabel(assets[index], index)} moved to position ${target + 1} of ${assets.length}.`
    );
  }

  function setDrag(id: string | null) {
    dragIdRef.current = id;
    setDragId(id);
  }

  function setDrop(index: number | null) {
    dropIndexRef.current = index;
    setDropIndex(index);
  }

  function handleDrop() {
    const currentDrag = dragIdRef.current;
    const gap = dropIndexRef.current;
    setDrag(null);
    setDrop(null);
    if (currentDrag === null || gap === null) return;
    const from = assets.findIndex((a) => a.id === currentDrag);
    // `gap` is a gap index (0..length); convert it to the final position.
    const to = gap > from ? gap - 1 : gap;
    if (from < 0 || from === to) return;
    void persistOrder(
      moveItem(assets, from, to),
      assets,
      `${assetLabel(assets[from], from)} moved to position ${to + 1} of ${assets.length}.`
    );
  }

  /** Where the held photo is now, if it is still on the board. */
  function heldIndex(): number {
    return held ? assets.findIndex((a) => a.id === held.id) : -1;
  }

  function pickUp(index: number) {
    setHeld({ id: assets[index].id, from: index });
    onAnnounce(
      `${assetLabel(assets[index], index)} picked up, position ${index + 1} of ${assets.length}. Arrow keys move it, Space drops it, Escape cancels.`
    );
  }

  /** Shows the held photo at a new position. Nothing is saved until it is dropped. */
  function holdAt(target: number) {
    const at = heldIndex();
    const to = Math.min(Math.max(target, 0), assets.length - 1);
    if (at < 0 || to === at) return;
    setAssets(moveItem(assets, at, to));
    onAnnounce(`${assetLabel(assets[at], at)}, position ${to + 1} of ${assets.length}.`);
  }

  function dropHeld() {
    const at = heldIndex();
    setHeld(null);
    if (!held || at < 0) return;
    const label = assetLabel(assets[at], at);
    if (at === held.from) onAnnounce(`${label} dropped where it was.`);
    else void persistOrder(assets, moveItem(assets, at, held.from), `${label} moved to position ${at + 1} of ${assets.length}.`);
  }

  function cancelHeld() {
    const at = heldIndex();
    setHeld(null);
    if (!held || at < 0) return;
    setAssets(moveItem(assets, at, held.from));
    onAnnounce(`Move cancelled. ${assetLabel(assets[at], at)} is back at position ${held.from + 1}.`);
  }

  return {
    heldId: held?.id ?? null,
    pickUp,
    holdAt,
    dropHeld,
    cancelHeld,
    dragId,
    dropIndex,
    isDragging: () => dragIdRef.current !== null,
    currentDropIndex: () => dropIndexRef.current,
    setDrag,
    setDrop,
    moveBy,
    handleDrop,
  };
}
