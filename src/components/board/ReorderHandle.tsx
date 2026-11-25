"use client";

import type { KeyboardEvent } from "react";

export interface ReorderHandleProps {
  label: string;
  index: number;
  count: number;
  /** Picked up from the keyboard. */
  held: boolean;
  onToggleHeld: () => void;
  onCancelHeld: () => void;
  onHoldAt: (index: number) => void;
  /** How many columns the grid has now: how far up and down move a held card. */
  columns: () => number;
  /** The element that explains the reorder keys. */
  keysHintId?: string;
  className?: string;
}

/** Lies over a card's photo: drag it, or pick it up with the keyboard (DIG-90; out of PhotoCard in DIG-93). */
export function ReorderHandle({ label, index, count, held, onToggleHeld, onCancelHeld, onHoldAt, columns, keysHintId, className = "" }: ReorderHandleProps) {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onToggleHeld();
      return;
    }
    if (!held) return;
    if (e.key === "Escape") return onCancelHeld();
    const target = {
      ArrowLeft: () => index - 1,
      ArrowRight: () => index + 1,
      ArrowUp: () => index - columns(),
      ArrowDown: () => index + columns(),
      Home: () => 0,
      End: () => count - 1,
    }[e.key];
    if (!target) return;
    e.preventDefault();
    onHoldAt(target());
  }

  // A div, not a button: Firefox will not start a drag from a button.
  return (
    <div
      role="button"
      tabIndex={0}
      data-reorder=""
      aria-label={`Reorder ${label}, position ${index + 1} of ${count}`}
      aria-pressed={held}
      aria-describedby={keysHintId}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // A screen reader's click; the pointer drags instead.
        if (e.detail === 0) onToggleHeld();
      }}
      onBlur={() => held && onCancelHeld()}
      className={`absolute inset-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vermilion-500 ${className}`}
    />
  );
}
