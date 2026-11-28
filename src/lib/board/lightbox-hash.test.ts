import { describe, expect, it } from "vitest";
import { pageHash, parsePageHash } from "./lightbox-hash";

// DIG-49: a shared link like /z/slug#page-3 opens that photo.
describe("pageHash", () => {
  it("names a page", () => {
    expect(pageHash(3)).toBe("#page-3");
  });
});

describe("parsePageHash", () => {
  it("reads a page number within the zine", () => {
    expect(parsePageHash("#page-3", 12)).toBe(3);
    expect(parsePageHash("#page-12", 12)).toBe(12);
    expect(parsePageHash("#page-1", 1)).toBe(1);
  });
  it.each(["", "#", "#page-", "#page-0", "#page-13", "#page--1", "#page-2.5", "#page-abc", "#Page-2", "#page-2x", "page-2", "#other"])(
    "ignores %j",
    (hash) => {
      expect(parsePageHash(hash, 12)).toBeNull();
    }
  );
});
