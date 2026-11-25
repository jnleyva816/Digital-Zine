"use client";

import { useEffect, useRef, useState } from "react";

const PRESS_MS = 400;
/** A finger that moves further than this before the press is scrolling. */
const SLOP = 10;
/** How near the edge a lifted photo scrolls the list along, and how fast, per frame. */
const EDGE = 72;
const SPEED = 9;

interface LongPressOptions {
  enabled: boolean;
  axis: "x" | "y";
  onLift: (id: string) => void;
  /** The gap the photo would land in: before or after the photo under the finger. */
  onOver: (id: string, after: boolean) => void;
  onDrop: () => void;
  onCancel: () => void;
}

/**
 * Moves a photo by long press (DIG-93). Touch events, not pointer events: once a photo is lifted the
 * page must stop scrolling, and only a touchmove that is not passive can ask iOS Safari for that.
 * Returns a ref for the list; its items carry `data-asset-id`.
 */
export function useLongPressReorder(options: LongPressOptions) {
  const [list, listRef] = useState<HTMLElement | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!list) return;
    let stop: ((finish: "onDrop" | "onCancel") => void) | null = null;

    function onStart(e: TouchEvent) {
      // A second finger ends it: that is a pinch.
      if (stop) return stop("onCancel");
      const target = e.target as HTMLElement;
      const card = target.closest<HTMLElement>("[data-asset-id]");
      const id = card?.dataset.assetId;
      if (!latest.current.enabled || !id || e.touches.length !== 1 || !target.closest("[data-reorder]")) return;
      const start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      let at = start;
      let lifted = false;
      let frame = 0;
      const scroller = latest.current.axis === "x" ? list!.closest<HTMLElement>("[data-scroller]") : null;

      const over = () => {
        const found = document.elementFromPoint?.(at.x, at.y)?.closest<HTMLElement>("[data-asset-id]");
        if (!found || !list!.contains(found)) return;
        const box = found.getBoundingClientRect();
        latest.current.onOver(found.dataset.assetId!, at.x > box.left + box.width / 2);
      };
      const follow = () => {
        const box = scroller?.getBoundingClientRect();
        // Clear of the app bar above, and the floating actions and navigation below.
        const from = box ? box.left : 56;
        const to = box ? box.right : innerHeight - 140;
        const p = box ? at.x : at.y;
        const by = p < from + EDGE ? -SPEED : p > to - EDGE ? SPEED : 0;
        // A press that has not moved yet scrolls nothing.
        if (by && Math.hypot(at.x - start.x, at.y - start.y) > SLOP) {
          if (scroller) scroller.scrollLeft += by;
          else window.scrollBy(0, by);
          over();
        }
        frame = requestAnimationFrame(follow);
      };
      const timer = setTimeout(() => {
        lifted = true;
        if (scroller) scroller.style.scrollSnapType = "none";
        navigator.vibrate?.(12);
        latest.current.onLift(id);
        frame = requestAnimationFrame(follow);
      }, PRESS_MS);

      const onMove = (m: TouchEvent) => {
        const point = { x: m.touches[0].clientX, y: m.touches[0].clientY };
        if (!lifted) {
          if (Math.hypot(point.x - start.x, point.y - start.y) > SLOP) stop?.("onCancel");
          return;
        }
        m.preventDefault();
        at = point;
        over();
      };
      const onEnd = (m: TouchEvent) => {
        // No click after a move.
        if (lifted) m.preventDefault();
        stop?.("onDrop");
      };
      const onTouchCancel = () => stop?.("onCancel");
      // Android's own long press would open a menu for the picture.
      const onMenu = (m: Event) => m.preventDefault();

      // On the touched element: it keeps getting them even if the card is redrawn without it.
      target.addEventListener("touchmove", onMove, { passive: false });
      target.addEventListener("touchend", onEnd, { passive: false });
      target.addEventListener("touchcancel", onTouchCancel);
      list!.addEventListener("contextmenu", onMenu);
      stop = (finish) => {
        stop = null;
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        target.removeEventListener("touchmove", onMove);
        target.removeEventListener("touchend", onEnd);
        target.removeEventListener("touchcancel", onTouchCancel);
        list!.removeEventListener("contextmenu", onMenu);
        if (!lifted) return;
        if (scroller) scroller.style.scrollSnapType = "";
        latest.current[finish]();
      };
    }

    // iOS Safari only lets a later touchmove stop scrolling if one that is not passive was there first.
    const noop = () => undefined;
    list.addEventListener("touchstart", onStart, { passive: true });
    list.addEventListener("touchmove", noop, { passive: false });
    return () => {
      stop?.("onCancel");
      list.removeEventListener("touchstart", onStart);
      list.removeEventListener("touchmove", noop);
    };
  }, [list]);

  return listRef;
}
