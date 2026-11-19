import { describe, expect, it } from "vitest";
import type { FujiRecipe } from "./fuji-recipe";
import { matchSavedRecipe, sameSettings, type SavedRecipe } from "./recipe-library";

const kodachrome: FujiRecipe = {
  name: "Kodachrome 64",
  filmSimulation: "Classic Chrome",
  dynamicRange: "DR200",
  grain: "Weak, Small",
  whiteBalance: { mode: "Daylight", red: 2, blue: -5 },
  highlight: 0,
  shadow: 0.5,
  iso: "ISO 160",
  exposureCompensation: "0 to +2/3",
};
const saved = (id: string, recipe: FujiRecipe): SavedRecipe => ({ id, recipe, photoCount: 0 });
/** What the camera's maker notes give: no name, ISO, or exposure compensation. */
const { name: _n, iso: _i, exposureCompensation: _e, ...found } = kodachrome;

describe("sameSettings (DIG-24)", () => {
  it("matches settings read from a photo to a saved recipe, ignoring name, ISO, and exposure compensation", () => {
    expect(sameSettings(found, kodachrome)).toBe(true);
  });

  it("does not match when any recorded setting differs, or one side has a setting the other lacks", () => {
    expect(sameSettings({ ...found, shadow: 1 }, kodachrome)).toBe(false);
    expect(sameSettings({ ...found, whiteBalance: { mode: "Daylight", red: 2, blue: -4 } }, kodachrome)).toBe(false);
    expect(sameSettings({ ...found, clarity: -2 }, kodachrome)).toBe(false);
  });
});

describe("matchSavedRecipe", () => {
  it("finds the saved recipe with the same settings, or none", () => {
    const library = [saved("a", { name: "Portra", filmSimulation: "Classic Neg." }), saved("b", kodachrome)];
    expect(matchSavedRecipe(found, library)?.id).toBe("b");
    expect(matchSavedRecipe({ ...found, filmSimulation: "Acros" }, library)).toBeNull();
    expect(matchSavedRecipe(null, library)).toBeNull();
  });
});
