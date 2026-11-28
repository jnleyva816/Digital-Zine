import { describe, expect, it } from "vitest";
import { MAX_PHOTO_ZOOM, clampOffset, clampZoom, isDoubleTap, pinchTo, swipeDirection, zoomAt } from "./pan-zoom";

// DIG-49: zoom and pan for the full-screen photo, without a gesture library.
const frame = { width: 400, height: 300 };

describe("clampZoom", () => {
  it("keeps zoom between 1 and the maximum", () => {
    expect(clampZoom(0.4)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(99)).toBe(MAX_PHOTO_ZOOM);
  });
});

describe("clampOffset", () => {
  it("does not let a zoomed photo slide off its frame", () => {
    expect(clampOffset(2, frame, { x: 500, y: -500 })).toEqual({ x: 200, y: -150 });
  });
  it("keeps the photo centred when it is not zoomed", () => {
    expect(clampOffset(1, frame, { x: 40, y: -20 })).toEqual({ x: 0, y: 0 });
  });
  it("leaves an offset that already fits alone", () => {
    expect(clampOffset(3, frame, { x: 100, y: 50 })).toEqual({ x: 100, y: 50 });
  });
});

describe("zoomAt", () => {
  it("zooms toward the tapped point, keeping that point of the photo under the finger", () => {
    const next = zoomAt({ x: 100, y: 0 }, { scale: 1, offset: { x: 0, y: 0 } }, 2, frame);
    expect(next.scale).toBe(2);
    // The photo point that was at x=100 is at 100 again: offset + scale * c = -100 + 2 * 100.
    expect(next.offset.x).toBe(-100);
    expect(next.offset.y).toBe(0);
  });
  it("zooming back out returns to the centre", () => {
    const next = zoomAt({ x: 100, y: 40 }, { scale: 2.5, offset: { x: -150, y: -60 } }, 1, frame);
    expect(next).toEqual({ scale: 1, offset: { x: 0, y: 0 } });
  });
  it("never zooms past the maximum", () => {
    expect(zoomAt({ x: 0, y: 0 }, { scale: 1, offset: { x: 0, y: 0 } }, 50, frame).scale).toBe(MAX_PHOTO_ZOOM);
  });
});

describe("pinchTo", () => {
  const base = { startScale: 1, startDistance: 100, startOffset: { x: 0, y: 0 }, startCenter: { x: 0, y: 0 }, center: { x: 0, y: 0 }, frame };
  it("scales by how far the fingers moved apart", () => {
    expect(pinchTo({ ...base, distance: 200 }).scale).toBe(2);
    expect(pinchTo({ ...base, distance: 50 }).scale).toBe(1);
    expect(pinchTo({ ...base, distance: 1000 }).scale).toBe(MAX_PHOTO_ZOOM);
  });
  it("follows the fingers' midpoint, so the pinched part of the photo stays between them", () => {
    const next = pinchTo({ ...base, distance: 200, startCenter: { x: 100, y: 0 }, center: { x: 100, y: 0 } });
    expect(next.scale).toBe(2);
    expect(next.offset.x).toBe(-100);
  });
  it("starting from an already zoomed photo multiplies from that zoom", () => {
    expect(pinchTo({ ...base, startScale: 2, distance: 150 }).scale).toBe(3);
  });
});

describe("isDoubleTap", () => {
  const first = { time: 1000, x: 100, y: 100 };
  it("is two taps close in time and place", () => {
    expect(isDoubleTap(first, { time: 1250, x: 108, y: 96 })).toBe(true);
  });
  it("is not, when the second tap is slow or far, or there was no first", () => {
    expect(isDoubleTap(first, { time: 1500, x: 100, y: 100 })).toBe(false);
    expect(isDoubleTap(first, { time: 1100, x: 200, y: 100 })).toBe(false);
    expect(isDoubleTap(null, { time: 1100, x: 100, y: 100 })).toBe(false);
  });
});

describe("swipeDirection", () => {
  it.each([
    [-120, 10, "next"],
    [120, -10, "prev"],
    [10, 140, "close"],
  ])("a drag of (%i, %i) is %s", (dx, dy, expected) => {
    expect(swipeDirection(dx, dy)).toBe(expected);
  });
  it.each([
    [20, 5],
    [-50, 0],
    [0, 60],
    [100, 90],
    [-5, -200],
  ])("a drag of (%i, %i) is not a swipe (too short, diagonal, or upward)", (dx, dy) => {
    expect(swipeDirection(dx, dy)).toBeNull();
  });
});
