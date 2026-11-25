import { describe, expect, it } from "vitest";
import { masonryColumns, packMasonry } from "./masonry";

describe("masonry layout (DIG-90)", () => {
  it("fits columns about 220 px wide: five at 1440 px, and never fewer than two", () => {
    expect(masonryColumns(1440 - 56)).toBe(5);
    expect(masonryColumns(358)).toBe(2);
    expect(masonryColumns(1864)).toBe(7);
  });

  it("puts each card, in order, in the shortest column, leftmost first", () => {
    const { cards, height } = packMasonry([100, 300, 200, 50, 80].map((h) => ({ height: h, span: 1 })), { width: 320, columns: 3, gap: 10 });
    expect(cards.map((c) => [c.left, c.top])).toEqual([[0, 0], [110, 0], [220, 0], [0, 110], [0, 170]]);
    expect(cards.every((c) => c.width === 100)).toBe(true);
    expect(height).toBe(300);
  });

  it("gives a large card two columns, clear of the cards above it", () => {
    const { cards } = packMasonry([{ height: 100, span: 1 }, { height: 40, span: 1 }, { height: 60, span: 1 }, { height: 90, span: 2 }], { width: 320, columns: 3, gap: 10 });
    expect(cards[3]).toEqual({ left: 110, top: 70, width: 210 });
  });

  it("is empty without cards, and never spans more columns than there are", () => {
    expect(packMasonry([], { width: 300, columns: 2, gap: 10 })).toEqual({ cards: [], height: 0 });
    expect(packMasonry([{ height: 10, span: 2 }], { width: 300, columns: 1, gap: 10 }).cards[0].width).toBe(300);
  });
});
