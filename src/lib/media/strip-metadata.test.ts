import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cleanJpeg } from "./strip-metadata";

const photoWithGps = () =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: "#336699" } })
    .withExif({ IFD0: { Copyright: "Joshua", Make: "FUJIFILM" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "27/1 57/1 0/1" } })
    .jpeg({ quality: 90 })
    .toBuffer();

/** The compressed image data: everything from the first start-of-scan marker on. */
const scanData = (jpeg: Buffer) => jpeg.subarray(jpeg.indexOf(Buffer.from([0xff, 0xda])));

describe("cleanJpeg (DIG-38)", () => {
  it("removes all EXIF, GPS included, without re-encoding an upright photo", async () => {
    const original = await photoWithGps();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const cleaned = await cleanJpeg(original);
    const meta = await sharp(cleaned).metadata();
    expect(meta.exif).toBeUndefined();
    expect(cleaned.includes(Buffer.from("FUJIFILM"))).toBe(false);
    expect([meta.width, meta.height]).toEqual([40, 20]);
    // Lossless: the image data is byte for byte the same.
    expect(scanData(cleaned).equals(scanData(original))).toBe(true);
  });

  it("applies the camera's rotation before dropping it, so a sideways photo stays upright", async () => {
    const rotated = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#336699" } })
      .withMetadata({ orientation: 6 })
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "27/1 57/1 0/1" } })
      .jpeg()
      .toBuffer();
    const cleaned = await cleanJpeg(rotated);
    const meta = await sharp(cleaned).metadata();
    expect(meta.exif).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });
});
