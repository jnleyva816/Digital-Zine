import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AVIF_QUALITY, VARIANT_WIDTHS } from "@/lib/limits";
import { shareImageUrl } from "./variant-urls";
import { pickVariantUrl, renderVariants, variantKeys } from "./variants";

describe("variant settings (DIG-26)", () => {
  it("uses AVIF quality 50 and 480/960/1600 widths", () => {
    expect(AVIF_QUALITY).toBe(50);
    expect(VARIANT_WIDTHS).toEqual([480, 960, 1600]);
  });
});

describe("variantKeys", () => {
  it("puts every variant in a folder named after the original, next to it", () => {
    expect(variantKeys("users/u1/123-abc-dscf1368.jpg")).toEqual({
      full: "users/u1/123-abc-dscf1368/full.avif",
      og: "users/u1/123-abc-dscf1368/og.jpg",
      widths: {
        480: "users/u1/123-abc-dscf1368/w480.avif",
        960: "users/u1/123-abc-dscf1368/w960.avif",
        1600: "users/u1/123-abc-dscf1368/w1600.avif",
      },
    });
  });
});

describe("shareImageUrl", () => {
  it("shares the JPEG preview of a processed photo, because link crawlers do not read AVIF", () => {
    expect(shareImageUrl("/api/media/users/u1/x/full.avif")).toBe("/api/media/users/u1/x/og.jpg");
  });

  it("shares an unprocessed photo as it is", () => {
    expect(shareImageUrl("/api/media/users/u1/x.jpg")).toBe("/api/media/users/u1/x.jpg");
  });
});

describe("pickVariantUrl", () => {
  const full = "https://cdn.example/users/u1/x/full.avif";

  it("serves the smallest variant at least as wide as requested", () => {
    expect(pickVariantUrl(full, 320)).toBe("https://cdn.example/users/u1/x/w480.avif");
    expect(pickVariantUrl(full, 480)).toBe("https://cdn.example/users/u1/x/w480.avif");
    expect(pickVariantUrl(full, 640)).toBe("https://cdn.example/users/u1/x/w960.avif");
    expect(pickVariantUrl(full, 1200)).toBe("https://cdn.example/users/u1/x/w1600.avif");
  });

  it("serves the full-resolution copy above 1600 px", () => {
    expect(pickVariantUrl(full, 2048)).toBe(full);
  });

  it("works for local media URLs too", () => {
    expect(pickVariantUrl("/api/media/users/u1/x/full.avif", 750)).toBe("/api/media/users/u1/x/w960.avif");
  });

  it("returns null for a photo that has no variants yet", () => {
    expect(pickVariantUrl("/api/media/users/u1/x.jpg", 750)).toBeNull();
  });
});

async function jpeg(width: number, height: number, withExif = false) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } });
  if (withExif) img = img.withExif({ IFD0: { Make: "FUJIFILM", Model: "X-T5", Artist: "Private Person" } });
  return img.jpeg({ quality: 90 }).toBuffer();
}

describe("renderVariants", () => {
  it("keeps full resolution and makes each width as AVIF, plus a JPEG for link previews", async () => {
    const out = await renderVariants(await jpeg(3000, 2000));
    expect(out.full.width).toBe(3000);
    expect(out.full.height).toBe(2000);
    expect((await sharp(out.full.bytes).metadata()).format).toBe("heif");
    expect(out.widths.map((w) => [w.width, w.height])).toEqual([
      [480, 320],
      [960, 640],
      [1600, 1067],
    ]);
    for (const w of out.widths) expect((await sharp(w.bytes).metadata()).width).toBe(w.width);
    const og = await sharp(out.og.bytes).metadata();
    expect([og.format, og.width]).toEqual(["jpeg", 1200]);
  });

  it("does not upscale: a small photo gets only the widths below its own", async () => {
    const out = await renderVariants(await jpeg(1000, 800));
    expect(out.widths.map((w) => w.width)).toEqual([480, 960]);
    expect(out.full.width).toBe(1000);
  });

  it("strips EXIF from every output", async () => {
    const out = await renderVariants(await jpeg(2000, 1500, true));
    for (const bytes of [out.full.bytes, out.og.bytes, ...out.widths.map((w) => w.bytes)]) {
      expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    }
  });

  it("applies the camera's rotation, so a portrait photo stays portrait", async () => {
    const rotated = await sharp(await jpeg(3000, 2000)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await renderVariants(rotated);
    expect([out.full.width, out.full.height]).toEqual([2000, 3000]);
  });

  it("makes a tiny inline blur placeholder", async () => {
    const out = await renderVariants(await jpeg(3000, 2000));
    expect(out.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(out.blurDataUrl.length).toBeLessThan(1000);
  });

  it("rejects bytes that are not an image", async () => {
    await expect(renderVariants(Buffer.from("not an image"))).rejects.toThrow();
  });
});
