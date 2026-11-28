import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AVIF_QUALITY, VARIANT_WIDTHS } from "@/lib/billing/limits";
import { shareImageUrl } from "./variant-urls";
import { pickVariantUrl, renderVariants, splitSourceWidth, variantKeys, variantWidthsFor, withSourceWidth } from "./variants";

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

// DIG-110: a photo narrower than 1600 px has no 1600 px copy, so nothing may ask for one.
describe("variantWidthsFor", () => {
  it("lists only the widths below the photo's own, as processing makes them", () => {
    expect(variantWidthsFor(3000)).toEqual([480, 960, 1600]);
    expect(variantWidthsFor(1601)).toEqual([480, 960, 1600]);
    expect(variantWidthsFor(1600)).toEqual([480, 960]);
    expect(variantWidthsFor(1104)).toEqual([480, 960]);
    expect(variantWidthsFor(750)).toEqual([480]);
    expect(variantWidthsFor(480)).toEqual([]);
  });

  it("lists none for a width that is missing or not a number", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(variantWidthsFor(bad)).toEqual([]);
  });
});

describe("pickVariantUrl with the photo's own width (DIG-110)", () => {
  const full = "https://cdn.example/users/u1/x/full.avif";

  it("never picks a copy that was not made: a 1104 px photo has no 1600 px copy", () => {
    expect(pickVariantUrl(full, 400, 1104)).toBe("https://cdn.example/users/u1/x/w480.avif");
    expect(pickVariantUrl(full, 900, 1104)).toBe("https://cdn.example/users/u1/x/w960.avif");
    expect(pickVariantUrl(full, 1200, 1104)).toBe(full);
    expect(pickVariantUrl(full, 3840, 1104)).toBe(full);
  });

  it("falls back to the full copy when a 750 px photo is asked for more than its 480 px copy", () => {
    expect(pickVariantUrl(full, 480, 750)).toBe("https://cdn.example/users/u1/x/w480.avif");
    expect(pickVariantUrl(full, 640, 750)).toBe(full);
  });

  it("serves the full copy for a photo too small to have any other", () => {
    expect(pickVariantUrl(full, 320, 480)).toBe(full);
  });

  it("is unchanged for a large photo", () => {
    expect(pickVariantUrl(full, 1200, 6000)).toBe("https://cdn.example/users/u1/x/w1600.avif");
  });

  it("keeps the old behaviour when the photo's width is unknown", () => {
    expect(pickVariantUrl(full, 1200, undefined)).toBe("https://cdn.example/users/u1/x/w1600.avif");
  });
});

describe("carrying the photo's width to the image loader", () => {
  it("round-trips a width on a processed photo's address", () => {
    const tagged = withSourceWidth("/api/media/users/u1/x/full.avif", 750);
    expect(tagged).not.toBe("/api/media/users/u1/x/full.avif");
    expect(splitSourceWidth(tagged)).toEqual({ src: "/api/media/users/u1/x/full.avif", sourceWidth: 750 });
  });

  it("leaves an address alone when there is no usable width", () => {
    for (const w of [null, undefined, 0, -1, Number.NaN]) {
      expect(withSourceWidth("/api/media/users/u1/x/full.avif", w)).toBe("/api/media/users/u1/x/full.avif");
    }
    expect(splitSourceWidth("/api/media/users/u1/x/full.avif")).toEqual({ src: "/api/media/users/u1/x/full.avif", sourceWidth: undefined });
  });

  it("does not touch the address of a photo that has no copies", () => {
    expect(withSourceWidth("/api/media/users/u1/x.jpg", 750)).toBe("/api/media/users/u1/x.jpg");
  });

  it("ignores a tag that is not a plain positive number", () => {
    expect(splitSourceWidth("/p/full.avif#sw=abc").sourceWidth).toBeUndefined();
    expect(splitSourceWidth("/p/full.avif#sw=-4").sourceWidth).toBeUndefined();
    expect(splitSourceWidth("/p/full.avif#sw=750").src).toBe("/p/full.avif");
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

  it("makes exactly the widths variantWidthsFor lists, for any photo size", async () => {
    for (const width of [300, 480, 750, 1104, 1600, 1700]) {
      const out = await renderVariants(await jpeg(width, Math.round(width * 0.75)));
      expect(out.widths.map((w) => w.width), `${width} px`).toEqual(variantWidthsFor(width));
    }
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
