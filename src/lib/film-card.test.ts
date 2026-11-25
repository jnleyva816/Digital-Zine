import { describe, expect, it } from "vitest";
import { copyRecipeText, recipeSettings, scalePosition, shotOnLabel } from "./film-card";
import type { FujiRecipe } from "./fuji-recipe";

// DIG-52: the recipe as a film card.
const recipe: FujiRecipe = {
  name: "Kodachrome 64",
  filmSimulation: "Classic Chrome",
  dynamicRange: "DR200",
  grain: "Weak, Small",
  colorChrome: "Strong",
  whiteBalance: { mode: "Daylight", red: 2, blue: -5 },
  highlight: -1,
  shadow: 0.5,
  color: 2,
  iso: "Auto up to ISO 6400",
};

describe("copyRecipeText", () => {
  it("is the name, then one setting per line, in camera menu order", () => {
    expect(copyRecipeText(recipe)).toBe(
      [
        "Kodachrome 64",
        "",
        "Film Simulation: Classic Chrome",
        "Dynamic Range: DR200",
        "Grain Effect: Weak, Small",
        "Color Chrome Effect: Strong",
        "White Balance: Daylight, +2 Red & -5 Blue",
        "Highlight: -1",
        "Shadow: +0.5",
        "Color: +2",
        "ISO: Auto up to ISO 6400",
      ].join("\n")
    );
  });
});

describe("scalePosition", () => {
  it("places a value between the camera's own ends, and never off the scale", () => {
    expect(scalePosition(-2, -2, 4)).toBe(0);
    expect(scalePosition(1, -2, 4)).toBe(0.5);
    expect(scalePosition(99, -2, 4)).toBe(1);
  });
});

describe("recipeSettings", () => {
  const by = (label: string) => recipeSettings(recipe).find((s) => s.label === label);

  it("draws tones as scales over the camera's real range", () => {
    expect(by("Highlight")).toEqual({ label: "Highlight", value: "-1", drawing: { kind: "scale", min: -2, max: 4, at: -1 } });
  });
  it("draws levels as steps", () => {
    expect(by("Color Chrome Effect")).toEqual({ label: "Color Chrome Effect", value: "Strong", drawing: { kind: "steps", count: 3, at: 2 } });
    expect(by("Dynamic Range")!.drawing).toEqual({ kind: "steps", count: 4, at: 2 });
  });
  it("draws white balance as its two shifts", () => {
    expect(by("White Balance")!.drawing).toEqual({ kind: "shift", red: 2, blue: -5, limit: 9 });
  });
  it("leaves out the headline film simulation, and anything not given", () => {
    expect(by("Film Simulation")).toBeUndefined();
    expect(by("Clarity")).toBeUndefined();
  });
  it("loses no setting that the plain list would show", () => {
    expect(recipeSettings(recipe).map((s) => s.label)).toHaveLength(8);
  });
});

describe("shotOnLabel", () => {
  it("names the camera and the film", () => {
    expect(shotOnLabel({ cameraMake: "FUJIFILM", cameraModel: "X-T5" }, recipe)).toBe("X-T5 · Classic Chrome");
    expect(shotOnLabel({ cameraModel: "X-T5" }, null)).toBe("X-T5");
    expect(shotOnLabel(null, recipe)).toBe("Classic Chrome");
  });
  it("is nothing when neither is known", () => {
    expect(shotOnLabel({ iso: 200 }, null)).toBeNull();
    expect(shotOnLabel({ cameraModel: "  " }, null)).toBeNull();
  });
});
