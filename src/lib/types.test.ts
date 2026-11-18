import { describe, expect, it } from "vitest";
import { parseExif, parsePageContent, parseRecipe, slugifyTitle } from "./types";

describe("parseExif", () => {
  it("returns null for non-objects and empty objects", () => {
    expect(parseExif(null)).toBeNull();
    expect(parseExif("ISO 200")).toBeNull();
    expect(parseExif([])).toBeNull();
    expect(parseExif({})).toBeNull();
    expect(parseExif({ iso: "  " })).toBeNull();
  });

  it("keeps known fields and drops wrongly typed ones", () => {
    expect(parseExif({ iso: 400, aperture: "f/2.8", shutterSpeed: 5, lens: "35mm", extra: "x" })).toEqual({
      iso: 400,
      aperture: "f/2.8",
      shutterSpeed: null,
      focalLength: null,
      cameraMake: null,
      cameraModel: null,
      lens: "35mm",
      takenAt: null,
    });
  });
});

describe("parseRecipe", () => {
  it("returns null without a title, ingredients, or method", () => {
    expect(parseRecipe(null)).toBeNull();
    expect(parseRecipe({ servings: "4" })).toBeNull();
    expect(parseRecipe({ title: "   ", ingredients: ["", "  "] })).toBeNull();
  });

  it("trims strings and drops blank or non-string list items", () => {
    expect(
      parseRecipe({ title: " Kraut ", ingredients: [" cabbage ", "", 3], method: ["shred"], servings: " 1 qt ", prepTime: "" })
    ).toEqual({ title: "Kraut", ingredients: ["cabbage"], method: ["shred"], servings: "1 qt" });
  });
});

describe("parsePageContent", () => {
  it("defaults missing fields", () => {
    expect(parsePageContent(null)).toEqual({ assetId: "", caption: "" });
    expect(parsePageContent({ assetId: "a1", caption: 7 })).toEqual({ assetId: "a1", caption: "" });
  });
});

describe("slugifyTitle", () => {
  it("lowercases, hyphenates, and trims", () => {
    expect(slugifyTitle("  Sunday Ferments — Issue 01! ")).toBe("sunday-ferments-issue-01");
  });

  it("caps length at 64 and never returns empty", () => {
    expect(slugifyTitle("a".repeat(100))).toHaveLength(64);
    expect(slugifyTitle("!!!")).toBe("untitled-zine");
  });
});
