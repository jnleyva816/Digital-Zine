import { VARIANT_WIDTHS } from "@/lib/limits";

// No server-only imports here: the next/image loader runs this in the browser.

/**
 * The stored copies of one photo (DIG-26): a full-resolution AVIF, smaller AVIFs that pages load,
 * and a JPEG for link previews, because Open Graph crawlers do not read AVIF. They sit in a folder
 * named after the original upload, which is deleted once they exist.
 */
export function variantKeys(originalKey: string) {
  const base = originalKey.replace(/\.[^./]+$/, "");
  return {
    full: `${base}/full.avif`,
    og: `${base}/og.jpg`,
    widths: Object.fromEntries(VARIANT_WIDTHS.map((w) => [w, `${base}/w${w}.avif`])) as Record<number, string>,
  };
}

/**
 * The widths processing makes copies at for a photo `sourceWidth` px wide: those below its own width,
 * because it never upscales (DIG-110). Processing and the image loader both use this, so the loader
 * can only ask for a copy that exists.
 */
export function variantWidthsFor(sourceWidth: number): number[] {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) return [];
  return VARIANT_WIDTHS.filter((w) => w < sourceWidth);
}

/**
 * For a processed photo's URL (ending in `/full.avif`), the URL of the smallest copy at least
 * `width` px wide, or the full-resolution copy when none that wide exists. Null for any other URL.
 * `sourceWidth` is the photo's own width, which says which copies exist (DIG-110); when it is not
 * known, every width is assumed to exist, as before.
 * Pure string work, so `next/image`'s loader can run it in the browser.
 */
export function pickVariantUrl(src: string, width: number, sourceWidth?: number): string | null {
  const match = /^(.*)\/full\.avif$/.exec(src);
  if (!match) return null;
  const available = sourceWidth === undefined ? VARIANT_WIDTHS : variantWidthsFor(sourceWidth);
  const chosen = available.find((w) => w >= width);
  return chosen === undefined ? src : `${match[1]}/w${chosen}.avif`;
}

const WIDTH_TAG = /^(.*)#sw=(\d+)$/;

/**
 * `next/image` hands its loader only the address, so the photo's own width travels on the end of it
 * as a `#sw=` tag that the loader removes again (DIG-110). A fragment never reaches a server. Only a
 * processed photo's address is tagged, and only when the width is a positive number.
 */
export function withSourceWidth(src: string, width: number | null | undefined): string {
  if (!/\/full\.avif$/.test(src)) return src;
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return src;
  return `${src}#sw=${Math.round(width)}`;
}

/** The address without its width tag, and the width the tag carried, if it carried a usable one. */
export function splitSourceWidth(tagged: string): { src: string; sourceWidth: number | undefined } {
  const match = WIDTH_TAG.exec(tagged);
  if (!match) return { src: tagged, sourceWidth: undefined };
  const sourceWidth = Number(match[2]);
  return { src: match[1], sourceWidth: sourceWidth > 0 ? sourceWidth : undefined };
}

/**
 * The image to put in Open Graph tags. Crawlers do not read AVIF, so a processed photo shares its
 * 1200 px JPEG; an unprocessed photo shares its original.
 */
export function shareImageUrl(publicUrl: string): string {
  return publicUrl.replace(/\/full\.avif$/, "/og.jpg");
}
