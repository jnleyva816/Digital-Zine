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
 * For a processed photo's URL (ending in `/full.avif`), the URL of the smallest copy at least
 * `width` px wide, or the full-resolution copy above the largest width. Null for any other URL.
 * Pure string work, so `next/image`'s loader can run it in the browser.
 */
export function pickVariantUrl(src: string, width: number): string | null {
  const match = /^(.*)\/full\.avif$/.exec(src);
  if (!match) return null;
  const chosen = VARIANT_WIDTHS.find((w) => w >= width);
  return chosen === undefined ? src : `${match[1]}/w${chosen}.avif`;
}

/**
 * The image to put in Open Graph tags. Crawlers do not read AVIF, so a processed photo shares its
 * 1200 px JPEG; an unprocessed photo shares its original.
 */
export function shareImageUrl(publicUrl: string): string {
  return publicUrl.replace(/\/full\.avif$/, "/og.jpg");
}
