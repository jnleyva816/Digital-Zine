import { describe, expect, it } from "vitest";
import { inView, photoDay, stripLayout } from "./strip";

describe("the day a photo was taken (DIG-91)", () => {
  it("is the camera's own date, whichever way it was written", () => {
    expect(photoDay("2026:10:21 23:59:00")).toBe("2026-10-21");
    expect(photoDay("2026-10-21 00:00:01")).toBe("2026-10-21");
    expect(photoDay("2026-10-21T23:30:00+09:00")).toBe("2026-10-21");
  });

  it("is unknown when there is no real date", () => {
    for (const bad of [null, undefined, "", "0000:00:00 00:00:00", "2026:13:40 10:00:00", "2026:02:31 10:00:00", "yesterday"]) expect(photoDay(bad)).toBeNull();
  });
});

describe("strip layout", () => {
  const item = (day: string | null, width = 100) => ({ day, width });

  it("keeps board order and starts a group wherever the day changes", () => {
    const { cards } = stripLayout([item("2026-10-21"), item("2026-10-21"), item("2026-10-22"), item(null), item(null), item("2026-10-21")]);
    expect(cards.map((c) => c.heading)).toEqual(["Oct 21", null, "Oct 22", "No date", null, "Oct 21"]);
  });

  it("adds the year when the photos span more than one", () => {
    const { cards } = stripLayout([item("2025-12-31"), item("2026-01-01"), item(null)]);
    expect(cards.map((c) => c.heading)).toEqual(["Dec 31, 2025", "Jan 1, 2026", "No date"]);
  });

  it("sets photos 16 px apart, and days further apart for the divider", () => {
    const { cards, width } = stripLayout([item("2026-10-21"), item("2026-10-21", 200), item("2026-10-22")]);
    expect(cards.map((c) => c.left)).toEqual([0, 116, 372]);
    expect(width).toBe(472);
  });

  it("is empty without photos", () => {
    expect(stripLayout([])).toEqual({ cards: [], width: 0 });
  });

  it("finds the photos at least half in view, and the nearest one when none is", () => {
    const { cards } = stripLayout([item("2026-10-21"), item("2026-10-21"), item("2026-10-21"), item("2026-10-21")]);
    expect(inView(cards, 0, 240)).toEqual([0, 1]);
    expect(inView(cards, 70, 220)).toEqual([1, 2]);
    expect(inView(cards, 120, 30)).toEqual([1, 1]);
    expect(inView([], 0, 500)).toEqual([0, -1]);
  });
});
