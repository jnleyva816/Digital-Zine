import { describe, expect, it } from "vitest";
import { bookSpreads, parseReadingView, spreadIndexOf, spreadLabel, withReadingView } from "./reading-view";

// DIG-50: how a zine's pages are laid out as a book, and how a link picks a reading mode.
describe("bookSpreads", () => {
  it("shows one page at a time on a narrow screen", () => {
    expect(bookSpreads(3, 1)).toEqual([[1], [2], [3]]);
  });

  it("puts page 1 alone as a cover, then pairs facing pages", () => {
    expect(bookSpreads(5, 2)).toEqual([[1], [2, 3], [4, 5]]);
    expect(bookSpreads(4, 2)).toEqual([[1], [2, 3], [4]]);
    expect(bookSpreads(2, 2)).toEqual([[1], [2]]);
  });

  it("handles a one-page and an empty zine", () => {
    expect(bookSpreads(1, 2)).toEqual([[1]]);
    expect(bookSpreads(0, 2)).toEqual([]);
  });
});

describe("spreadIndexOf", () => {
  it("finds the spread that holds a page, so resizing keeps the reader's place", () => {
    expect(spreadIndexOf(bookSpreads(5, 2), 3)).toBe(1);
    expect(spreadIndexOf(bookSpreads(5, 1), 3)).toBe(2);
  });
  it("falls back to the first spread", () => {
    expect(spreadIndexOf(bookSpreads(5, 2), 99)).toBe(0);
  });
});

describe("spreadLabel", () => {
  it("names one page or two", () => {
    expect(spreadLabel([1], 5)).toBe("Page 1 of 5");
    expect(spreadLabel([2, 3], 5)).toBe("Pages 2 and 3 of 5");
  });
});

describe("the reading mode in a link", () => {
  it("reads only the modes that exist", () => {
    expect(parseReadingView("book")).toBe("book");
    expect(parseReadingView("scroll")).toBe("scroll");
    for (const bad of [null, undefined, "", "BOOK", "<script>"]) expect(parseReadingView(bad)).toBeNull();
  });

  it("sets it without losing the rest of the address", () => {
    expect(withReadingView("/z/a/b", "?ref=x", "#page-2", "book")).toBe("/z/a/b?ref=x&view=book#page-2");
    expect(withReadingView("/z/a/b", "?view=book", "", "scroll")).toBe("/z/a/b");
  });
});
