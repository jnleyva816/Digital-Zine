import { describe, expect, it } from "vitest";
import { fujiRecipeSchema } from "./fuji-recipe";
import { readFujiRecipe } from "./fuji-makernote";
import {
  CLASSIC_CHROME_TAGS,
  buildFujiMakerNote,
  buildJpegWithMakerNote,
  type FujiTagValue,
} from "../../tests/fixtures/fuji-jpeg";

const jpeg = (tags: Record<number, FujiTagValue>, opts?: Parameters<typeof buildJpegWithMakerNote>[1]) =>
  buildJpegWithMakerNote(buildFujiMakerNote(tags), opts).buffer as ArrayBuffer;

describe("readFujiRecipe", () => {
  it("decodes a full Classic Chrome recipe from the maker note", () => {
    expect(readFujiRecipe(jpeg(CLASSIC_CHROME_TAGS))).toEqual({
      filmSimulation: "Classic Chrome",
      dynamicRange: "DR200",
      grain: "Weak, Large",
      colorChrome: "Strong",
      colorChromeFxBlue: "Weak",
      whiteBalance: { mode: "Kelvin", kelvin: 5200, red: 2, blue: -4 },
      highlight: 0.5,
      shadow: -2,
      color: 2,
      sharpness: -1,
      clarity: -3,
      noiseReduction: -4,
    });
  });

  it("produces settings the recipe schema accepts once named", () => {
    const found = readFujiRecipe(jpeg(CLASSIC_CHROME_TAGS));
    expect(fujiRecipeSchema.safeParse({ name: "Found", ...found }).success).toBe(true);
  });

  it("reads the TIFF block in either byte order", () => {
    expect(readFujiRecipe(jpeg(CLASSIC_CHROME_TAGS, { byteOrder: "II" }))?.filmSimulation).toBe("Classic Chrome");
  });

  it("takes monochrome simulations and filters from the saturation tag, with no color setting", () => {
    const found = readFujiRecipe(
      jpeg({
        0x1003: { type: "int16u", value: 0x501 }, // Acros + R
        0x1401: { type: "int16u", value: 0x0 }, // Film mode says Provia, but B&W wins
        0x1047: { type: "int32s", value: 64 },
      })
    );
    expect(found).toEqual({ filmSimulation: "Acros + R", grain: "Strong, Small" });
  });

  it("maps the other monochrome codes", () => {
    const sim = (code: number) => readFujiRecipe(jpeg({ 0x1003: { type: "int16u", value: code } }))?.filmSimulation;
    expect(sim(0x300)).toBe("Monochrome");
    expect(sim(0x302)).toBe("Monochrome + Ye");
    expect(sim(0x310)).toBe("Sepia");
    expect(sim(0x503)).toBe("Acros + G");
  });

  it("maps every color film mode the app offers", () => {
    const sim = (code: number) => readFujiRecipe(jpeg({ 0x1401: { type: "int16u", value: code } }))?.filmSimulation;
    expect(sim(0x0)).toBe("Provia/Standard");
    expect(sim(0x200)).toBe("Velvia/Vivid");
    expect(sim(0x120)).toBe("Astia/Soft");
    expect(sim(0x501)).toBe("Pro Neg. Hi");
    expect(sim(0x700)).toBe("Eterna/Cinema");
    expect(sim(0x800)).toBe("Classic Neg.");
    expect(sim(0x900)).toBe("Eterna Bleach Bypass");
    expect(sim(0xa00)).toBe("Nostalgic Neg.");
    expect(sim(0xb00)).toBe("Reala Ace");
  });

  it("reads auto dynamic range and preset white balance with no shift", () => {
    expect(
      readFujiRecipe(
        jpeg({
          0x1401: { type: "int16u", value: 0x800 },
          0x1402: { type: "int16u", value: 0x0 },
          0x1002: { type: "int16u", value: 0x100 },
        })
      )
    ).toEqual({
      filmSimulation: "Classic Neg.",
      dynamicRange: "DR-Auto",
      whiteBalance: { mode: "Daylight", red: 0, blue: 0 },
    });
  });

  it("accepts older bodies that store the white balance shift in raw steps", () => {
    const found = readFujiRecipe(
      jpeg({
        0x1401: { type: "int16u", value: 0x600 },
        0x1002: { type: "int16u", value: 0x200 },
        0x100a: { type: "int32s[]", value: [3, -2] },
      })
    );
    expect(found?.whiteBalance).toEqual({ mode: "Shade", red: 3, blue: -2 });
  });

  it("skips values it can't express instead of guessing", () => {
    const found = readFujiRecipe(
      jpeg({
        0x1401: { type: "int16u", value: 0x100 }, // Studio Portrait: not offered
        0x1002: { type: "int16u", value: 0xf00 }, // Custom WB: not offered
        0x1001: { type: "int16u", value: 0x8000 }, // "Film Simulation"
      })
    );
    expect(found).toBeNull();
  });

  it("returns null for photos from other cameras, without a maker note, or with broken data", () => {
    expect(readFujiRecipe(jpeg(CLASSIC_CHROME_TAGS, { make: "Canon" }))).toBeNull();
    expect(readFujiRecipe(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toBeNull();
    expect(readFujiRecipe(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
    const broken = buildJpegWithMakerNote(buildFujiMakerNote(CLASSIC_CHROME_TAGS));
    expect(readFujiRecipe(broken.slice(0, broken.length - 40).buffer)).toBeNull();
  });
});
