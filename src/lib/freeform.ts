import { MAX_TILT, PLACEMENT_WIDTH } from "@/lib/board-layout";

/** The geometry of the free-form board (DIG-87). Pure, in board units: pixels at 100% zoom. */
export interface Item {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
/** Where the board is on screen: screen = board * zoom + (x, y). */
export interface BoardViewport {
  x: number;
  y: number;
  zoom: number;
}
interface Point {
  x: number;
  y: number;
}
interface Size {
  width: number;
  height: number;
}

export const ZOOM = { min: 0.25, max: 2 };
export const NUDGE = { small: 8, large: 32 };
export const SIZE_STEP = 20;
const GAP = 28;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const clampWidth = (width: number) => clamp(width, PLACEMENT_WIDTH.min, PLACEMENT_WIDTH.max);
export const clampZoom = (zoom: number) => clamp(zoom, ZOOM.min, ZOOM.max);
const round = (n: number) => Math.round(n * 10) / 10;

/** Up 3 degrees, and from the steepest right back to the steepest left. */
export function nextTilt(rotation: number): number {
  const next = rotation + 3;
  return next > MAX_TILT ? -MAX_TILT : next;
}

export type Corner = "tl" | "tr" | "bl" | "br";

/** A new size after a corner is dragged `dx` across the board. The opposite corner stays where it was. */
export function resizeFrom(start: Item, corner: Corner, dx: number): { x: number; y: number; width: number } {
  const left = corner.endsWith("l");
  const top = corner.startsWith("t");
  const width = round(clampWidth(start.width + (left ? -dx : dx)));
  const grow = width - start.width;
  return {
    x: left ? start.x - grow : start.x,
    y: top ? start.y - grow * (start.height / start.width) : start.y,
    width,
  };
}

export const toBoard = (view: BoardViewport, at: Point): Point => ({ x: (at.x - view.x) / view.zoom, y: (at.y - view.y) / view.zoom });

/** Zooms around a point on screen, which stays over the same spot on the board. */
export function zoomAt(view: BoardViewport, at: Point, zoom: number): BoardViewport {
  const next = clampZoom(zoom);
  const spot = toBoard(view, at);
  return { x: at.x - spot.x * next, y: at.y - spot.y * next, zoom: next };
}

export function bounds(items: Item[]) {
  if (items.length === 0) return null;
  return {
    left: Math.min(...items.map((i) => i.x)),
    top: Math.min(...items.map((i) => i.y)),
    right: Math.max(...items.map((i) => i.x + i.width)),
    bottom: Math.max(...items.map((i) => i.y + i.height)),
  };
}

/** The view that shows every item, never past 100%. An empty board is centred on its origin. */
export function fitView(items: Item[], size: Size, padding = 80): BoardViewport {
  const box = bounds(items);
  if (!box) return { x: size.width / 2, y: size.height / 2, zoom: 1 };
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const zoom = clampZoom(Math.min(1, (size.width - padding * 2) / width, (size.height - padding * 2) / height));
  return { x: size.width / 2 - ((box.left + box.right) / 2) * zoom, y: size.height / 2 - ((box.top + box.bottom) / 2) * zoom, zoom };
}

export interface Moved {
  id: string;
  x: number;
  y: number;
  rotation: number;
}

/** A neat grid around where the items are now, with no tilt. */
export function tidy(items: Item[]): Moved[] {
  const box = bounds(items);
  if (!box) return [];
  const columns = Math.max(1, Math.round(Math.sqrt(items.length * 1.6)));
  const cell = Math.max(...items.map((i) => i.width)) + GAP;
  const out: Moved[] = [];
  let y = box.top;
  for (let i = 0; i < items.length; i += columns) {
    const row = items.slice(i, i + columns);
    row.forEach((item, c) => out.push({ id: item.id, x: round(box.left + c * cell + (cell - GAP - item.width) / 2), y: round(y), rotation: 0 }));
    y += Math.max(...row.map((r) => r.height)) + GAP;
  }
  return out;
}

/** Spread out, with a small random tilt each. */
export function scatter(items: Item[], random: () => number): Moved[] {
  const box = bounds(items);
  if (!box) return [];
  const columns = Math.max(1, Math.round(Math.sqrt(items.length * 1.6)));
  return items.map((item, i) => ({
    id: item.id,
    x: round(box.left + (i % columns) * 230 + (random() - 0.5) * 120),
    y: round(box.top + Math.floor(i / columns) * 270 + (random() - 0.5) * 120),
    rotation: Math.round((random() - 0.5) * 16),
  }));
}
