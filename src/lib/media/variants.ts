import sharp from "sharp";
import { AVIF_QUALITY, VARIANT_WIDTHS } from "@/lib/limits";

export { pickVariantUrl, variantKeys } from "./variant-urls";

export interface RenderedImage {
  bytes: Buffer;
  width: number;
  height: number;
}

const OG_WIDTH = 1200;

async function encode(pipeline: sharp.Sharp): Promise<RenderedImage> {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

/** Pixel size of an image once the camera's rotation is applied, or null if it cannot be read. */
export async function readImageSize(input: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height) return null;
    const swap = (meta.orientation ?? 1) >= 5;
    return swap ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

/**
 * Renders every copy of a photo. The camera's rotation is applied, and sharp drops EXIF and other
 * metadata unless asked to keep it, so no output carries the original's EXIF. Widths at or above
 * the photo's own width are skipped rather than upscaled.
 */
export async function renderVariants(input: Buffer) {
  const source = sharp(input, { failOn: "error" }).rotate();
  const meta = await sharp(input).metadata();
  // EXIF orientations 5–8 swap width and height once `.rotate()` applies them.
  const width = (meta.orientation ?? 1) >= 5 ? (meta.height ?? 0) : (meta.width ?? 0);
  const avif = { quality: AVIF_QUALITY, effort: 4 } as const;

  const full = await encode(source.clone().avif(avif));
  const widths: RenderedImage[] = [];
  for (const w of VARIANT_WIDTHS.filter((w) => w < width)) {
    widths.push(await encode(source.clone().resize({ width: w }).avif(avif)));
  }
  const og = await encode(
    source.clone().resize({ width: Math.min(OG_WIDTH, width) }).jpeg({ quality: 82, mozjpeg: true })
  );
  const blur = await source.clone().resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer();

  return { full, og, widths, blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}` };
}
