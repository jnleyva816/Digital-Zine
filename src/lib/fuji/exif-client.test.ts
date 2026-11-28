import { describe, expect, it } from "vitest";
import {
  CLASSIC_CHROME_TAGS,
  buildFujiMakerNote,
  buildJpegWithMakerNote,
} from "../../../tests/fixtures/fuji-jpeg";
import { extractExifFromFile } from "./exif-client";

function jpegFile(bytes: Uint8Array, name = "DSCF0412.jpg") {
  return new File([bytes], name, { type: "image/jpeg" });
}

describe("extractExifFromFile", () => {
  it("returns the Fujifilm recipe found in the photo along with its EXIF", async () => {
    const file = jpegFile(buildJpegWithMakerNote(buildFujiMakerNote(CLASSIC_CHROME_TAGS)));
    const result = await extractExifFromFile(file);
    expect(result.foundRecipe).toEqual({
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
    expect(result.exif?.cameraMake).toBe("FUJIFILM");
  });

  it("returns no recipe for a photo that is not Fujifilm", async () => {
    const file = jpegFile(buildJpegWithMakerNote(buildFujiMakerNote(CLASSIC_CHROME_TAGS), { make: "Canon" }));
    const result = await extractExifFromFile(file);
    expect(result.foundRecipe).toBeNull();
  });

  it("returns nothing for a file it cannot read", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "notes.bin", { type: "application/octet-stream" });
    await expect(extractExifFromFile(file)).resolves.toEqual({ exif: null, foundRecipe: null });
  });
});
