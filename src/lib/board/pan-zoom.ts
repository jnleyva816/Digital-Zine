/**
 * Zoom and pan for the full-screen photo (DIG-49), written by hand so there is no gesture library.
 * Positions are in px from the centre of the photo's frame. A point `c` of the photo (measured the
 * same way, at zoom 1) appears at `offset + scale * c`.
 */
export const MAX_PHOTO_ZOOM = 4;
/** How far a double-tap zooms in. */
export const DOUBLE_TAP_ZOOM = 2.5;

export interface Offset {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
const SWIPE_MIN_PX = 60;
const SWIPE_DOWN_MIN_PX = 90;
/** A swipe must be this much more along its axis than across it, so a diagonal drag is not one. */
const SWIPE_DOMINANCE = 1.5;

const clamp = (value: number, limit: number) => Math.min(Math.max(value, -limit), limit);

export const clampZoom = (z: number) => Math.min(Math.max(z, 1), MAX_PHOTO_ZOOM);

/** Keeps a zoomed photo covering its frame: it can move by at most (scale - 1) / 2 of the frame each way. */
export function clampOffset(scale: number, frame: Size, offset: Offset): Offset {
  if (scale <= 1) return { x: 0, y: 0 };
  return { x: clamp(offset.x, ((scale - 1) * frame.width) / 2), y: clamp(offset.y, ((scale - 1) * frame.height) / 2) };
}

/** Zooms to `toScale`, keeping the part of the photo under `point` under it. */
export function zoomAt(point: Offset, from: { scale: number; offset: Offset }, toScale: number, frame: Size) {
  const scale = clampZoom(toScale);
  if (scale <= 1) return { scale: 1, offset: { x: 0, y: 0 } };
  const ratio = scale / from.scale;
  return {
    scale,
    offset: clampOffset(scale, frame, {
      x: point.x - ratio * (point.x - from.offset.x),
      y: point.y - ratio * (point.y - from.offset.y),
    }),
  };
}

/** The zoom and offset while two fingers pinch: scale by how far apart they are, and follow their midpoint. */
export function pinchTo(args: {
  startScale: number;
  startDistance: number;
  distance: number;
  startOffset: Offset;
  startCenter: Offset;
  center: Offset;
  frame: Size;
}) {
  const scale = clampZoom(args.startDistance > 0 ? (args.startScale * args.distance) / args.startDistance : args.startScale);
  if (scale <= 1) return { scale: 1, offset: { x: 0, y: 0 } };
  // The photo point that was under the fingers' first midpoint stays under their current midpoint.
  const cx = (args.startCenter.x - args.startOffset.x) / args.startScale;
  const cy = (args.startCenter.y - args.startOffset.y) / args.startScale;
  return { scale, offset: clampOffset(scale, args.frame, { x: args.center.x - scale * cx, y: args.center.y - scale * cy }) };
}

export interface Tap {
  time: number;
  x: number;
  y: number;
}

/** Two taps close together in time and place. */
export function isDoubleTap(prev: Tap | null, next: Tap): boolean {
  if (!prev) return false;
  const elapsed = next.time - prev.time;
  return elapsed >= 0 && elapsed <= DOUBLE_TAP_MS && Math.abs(next.x - prev.x) <= DOUBLE_TAP_PX && Math.abs(next.y - prev.y) <= DOUBLE_TAP_PX;
}

/** Which gesture a finished one-finger drag was: left and right change photo, down closes, anything else is nothing. */
export function swipeDirection(dx: number, dy: number): "next" | "prev" | "close" | null {
  if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) >= Math.abs(dy) * SWIPE_DOMINANCE) return dx < 0 ? "next" : "prev";
  if (dy >= SWIPE_DOWN_MIN_PX && dy >= Math.abs(dx) * SWIPE_DOMINANCE) return "close";
  return null;
}
