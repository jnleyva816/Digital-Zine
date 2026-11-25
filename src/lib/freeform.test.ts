import { describe, expect, it } from "vitest";
import { bounds, clampWidth, fitView, nextTilt, resizeFrom, scatter, tidy, toBoard, zoomAt, ZOOM, type Item } from "./freeform";

// DIG-87: the geometry of the free-form board, in board units.
const item = (id: string, over: Partial<Item> = {}): Item => ({ id, x: 0, y: 0, width: 200, height: 250, rotation: 0, ...over });

describe("size and tilt", () => {
  it("keeps widths between 110 and 380", () => {
    expect([50, 200, 900].map(clampWidth)).toEqual([110, 200, 380]);
  });
  it("steps the tilt by 3 degrees and wraps at 15", () => {
    expect(nextTilt(0)).toBe(3);
    expect(nextTilt(-5)).toBe(-2);
    expect(nextTilt(15)).toBe(-15);
    expect(nextTilt(14)).toBe(-15);
  });
  it("resizes from a corner, keeping the opposite corner still", () => {
    const start = item("a", { x: 100, y: 100 });
    expect(resizeFrom(start, "br", 50)).toEqual({ x: 100, y: 100, width: 250 });
    expect(resizeFrom(start, "tl", -40)).toEqual({ x: 60, y: 50, width: 240 });
    // At the limit the far corner still does not move.
    expect(resizeFrom(start, "tl", -900)).toEqual({ x: -80, y: -125, width: 380 });
  });
});

describe("zoom", () => {
  it("keeps the point under the pointer still", () => {
    const view = { x: 30, y: 40, zoom: 1 };
    const at = { x: 200, y: 120 };
    const next = zoomAt(view, at, 1.5);
    expect(toBoard(next, at)).toEqual(toBoard(view, at));
    expect(next.zoom).toBe(1.5);
  });
  it("stays between 25% and 200%", () => {
    expect(ZOOM).toEqual({ min: 0.25, max: 2 });
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 99).zoom).toBe(2);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 0.001).zoom).toBe(0.25);
  });
});

describe("fit", () => {
  it("shows every item, with room around them", () => {
    const items = [item("a", { x: -500 }), item("b", { x: 900, y: 700 })];
    const view = fitView(items, { width: 800, height: 600 });
    const box = bounds(items)!;
    for (const [x, y] of [[box.left, box.top], [box.right, box.bottom]]) {
      expect(x * view.zoom + view.x).toBeGreaterThanOrEqual(0);
      expect(x * view.zoom + view.x).toBeLessThanOrEqual(800);
      expect(y * view.zoom + view.y).toBeGreaterThanOrEqual(0);
      expect(y * view.zoom + view.y).toBeLessThanOrEqual(600);
    }
  });
  it("never enlarges past 100%, and copes with an empty board", () => {
    expect(fitView([item("a")], { width: 4000, height: 4000 }).zoom).toBe(1);
    expect(fitView([], { width: 800, height: 600 })).toEqual({ x: 400, y: 300, zoom: 1 });
  });
});

describe("tidy up and scatter", () => {
  const many = Array.from({ length: 12 }, (_, i) => item(`i${i}`, { x: i * 7, y: i * 3, rotation: 9, height: 200 + (i % 3) * 40 }));
  it("tidies into a grid with no tilt and no overlaps", () => {
    const placed = tidy(many).map((p, i) => ({ ...many[i], ...p }));
    for (const p of placed) expect(p.rotation).toBe(0);
    for (const a of placed) for (const b of placed) {
      if (a.id === b.id) continue;
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      expect(apart, `${a.id} and ${b.id}`).toBe(true);
    }
  });
  it("scatters with small tilts within the limits", () => {
    for (const p of scatter(many, () => 0.99)) expect(Math.abs(p.rotation)).toBeLessThanOrEqual(15);
    expect(new Set(scatter(many, Math.random).map((p) => `${p.x},${p.y}`)).size).toBe(12);
  });
});
