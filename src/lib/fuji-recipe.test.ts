import { describe, expect, it } from "vitest";
import {
  EXPOSURE_COMPENSATION,
  FILM_SIMULATIONS,
  ISO_OPTIONS,
  formatSigned,
  parseFujiRecipe,
  recipeRows,
  type FujiRecipe,
} from "./fuji-recipe";

const kodachrome: FujiRecipe = {
  name: "Kodachrome 64",
  filmSimulation: "Classic Chrome",
  dynamicRange: "DR200",
  grain: "Weak, Small",
  colorChrome: "Strong",
  colorChromeFxBlue: "Off",
  whiteBalance: { mode: "Daylight", red: 2, blue: -5 },
  highlight: 0,
  shadow: 0.5,
  color: 2,
  sharpness: 1,
  clarity: 3,
  noiseReduction: -4,
  iso: "Auto up to ISO 6400",
  exposureCompensation: "0 to +2/3",
};

describe("camera option lists", () => {
  it("lists Fujifilm film simulations, monochrome filters included", () => {
    for (const sim of ["Classic Chrome", "Classic Neg.", "Eterna/Cinema", "Acros + R", "Reala Ace", "Nostalgic Neg."]) {
      expect(FILM_SIMULATIONS).toContain(sim);
    }
  });

  it("offers ISO as auto ceilings and fixed values", () => {
    expect(ISO_OPTIONS).toContain("Auto up to ISO 3200");
    expect(ISO_OPTIONS).toContain("ISO 160");
  });

  it("offers exposure compensation in third stops from -3 to +3", () => {
    expect(EXPOSURE_COMPENSATION).toContain("-1/3");
    expect(EXPOSURE_COMPENSATION).toContain("+2 2/3");
    expect(EXPOSURE_COMPENSATION[0]).toBe("-3");
    expect(EXPOSURE_COMPENSATION.at(-1)).toBe("+3");
  });
});

describe("parseFujiRecipe", () => {
  it("accepts a full recipe", () => {
    expect(parseFujiRecipe(kodachrome)).toEqual(kodachrome);
  });

  it("needs only a name and a film simulation, and trims the name", () => {
    expect(parseFujiRecipe({ name: "  Portra  ", filmSimulation: "Classic Neg." })).toEqual({
      name: "Portra",
      filmSimulation: "Classic Neg.",
    });
  });

  it("rejects old food recipes and anything else that isn't a Fujifilm recipe", () => {
    expect(parseFujiRecipe({ title: "Kraut", ingredients: ["cabbage"], method: ["shred"] })).toBeNull();
    expect(parseFujiRecipe(null)).toBeNull();
    expect(parseFujiRecipe({ name: "", filmSimulation: "Classic Chrome" })).toBeNull();
    expect(parseFujiRecipe({ name: "X", filmSimulation: "Kodak Gold" })).toBeNull();
  });

  it("rejects values the camera cannot set", () => {
    expect(parseFujiRecipe({ ...kodachrome, highlight: 0.25 })).toBeNull();
    expect(parseFujiRecipe({ ...kodachrome, highlight: -2.5 })).toBeNull();
    expect(parseFujiRecipe({ ...kodachrome, color: 1.5 })).toBeNull();
    expect(parseFujiRecipe({ ...kodachrome, clarity: 6 })).toBeNull();
    expect(parseFujiRecipe({ ...kodachrome, whiteBalance: { mode: "Daylight", red: 10, blue: 0 } })).toBeNull();
    expect(parseFujiRecipe({ ...kodachrome, whiteBalance: { mode: "Kelvin", red: 0, blue: 0 } })).toBeNull();
    expect(parseFujiRecipe({ ...kodachrome, whiteBalance: { mode: "Kelvin", kelvin: 2400, red: 0, blue: 0 } })).toBeNull();
    expect(parseFujiRecipe({ ...kodachrome, name: "x".repeat(81) })).toBeNull();
  });

  it("accepts a Kelvin white balance in 10 K steps", () => {
    const wb = { mode: "Kelvin", kelvin: 5200, red: 0, blue: -3 };
    expect(parseFujiRecipe({ ...kodachrome, whiteBalance: wb })?.whiteBalance).toEqual(wb);
    expect(parseFujiRecipe({ ...kodachrome, whiteBalance: { ...wb, kelvin: 5205 } })).toBeNull();
  });
});

describe("formatSigned", () => {
  it("shows a sign, half steps, and a bare zero", () => {
    expect(formatSigned(1.5)).toBe("+1.5");
    expect(formatSigned(-2)).toBe("-2");
    expect(formatSigned(0)).toBe("0");
  });
});

describe("recipeRows", () => {
  it("lists the settings in camera menu order, the way recipes are shared", () => {
    expect(recipeRows(kodachrome)).toEqual([
      { label: "Film Simulation", value: "Classic Chrome" },
      { label: "Dynamic Range", value: "DR200" },
      { label: "Grain Effect", value: "Weak, Small" },
      { label: "Color Chrome Effect", value: "Strong" },
      { label: "Color Chrome FX Blue", value: "Off" },
      { label: "White Balance", value: "Daylight, +2 Red & -5 Blue" },
      { label: "Highlight", value: "0" },
      { label: "Shadow", value: "+0.5" },
      { label: "Color", value: "+2" },
      { label: "Sharpness", value: "+1" },
      { label: "Clarity", value: "+3" },
      { label: "Noise Reduction", value: "-4" },
      { label: "ISO", value: "Auto up to ISO 6400" },
      { label: "Exposure Compensation", value: "0 to +2/3" },
    ]);
  });

  it("leaves out settings that were not given, and shows Kelvin", () => {
    expect(
      recipeRows({
        name: "Eterna Summer",
        filmSimulation: "Eterna/Cinema",
        whiteBalance: { mode: "Kelvin", kelvin: 5200, red: 0, blue: 0 },
      })
    ).toEqual([
      { label: "Film Simulation", value: "Eterna/Cinema" },
      { label: "White Balance", value: "5200K, 0 Red & 0 Blue" },
    ]);
  });
});
