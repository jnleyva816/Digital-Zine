import type { ImageLoaderProps } from "next/image";

/**
 * Custom next/image loader.
 *
 * When NEXT_PUBLIC_IMAGE_CDN_URL is configured (e.g. Cloudflare Images,
 * Imgix, or CloudFront image proxy), public reads route through the CDN
 * with width & quality hints. Without a CDN configured, assets load directly
 * from their local `/api/media/...` or S3 public URL without paid services.
 */
export default function zineImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  const cdnBase = process.env.NEXT_PUBLIC_IMAGE_CDN_URL?.trim();
  const q = quality || 82;

  if (!cdnBase) {
    const separator = src.includes("?") ? "&" : "?";
    return `${src}${separator}w=${width}&q=${q}`;
  }

  const normalizedCdn = cdnBase.replace(/\/+$/, "");
  const encodedSrc = encodeURIComponent(src);
  return `${normalizedCdn}?url=${encodedSrc}&w=${width}&q=${q}`;
}
