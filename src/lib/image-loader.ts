import type { ImageLoaderProps } from "next/image";
import { pickVariantUrl } from "@/lib/media/variant-urls";

/**
 * Custom next/image loader.
 *
 * When NEXT_PUBLIC_IMAGE_CDN_URL is configured (e.g. Cloudflare Images,
 * Imgix, or CloudFront image proxy), public reads route through the CDN
 * with width & quality hints. Without a CDN configured, assets load directly
 * from their local `/api/media/...` or S3 public URL without paid services.
 */
export default function zineImageLoader({
  src: requested,
  width,
  quality,
}: ImageLoaderProps): string {
  // A processed photo has smaller AVIF copies next to it; load the smallest that is wide enough
  // (DIG-26). The `w` and `q` hints stay so next/image sees the width used, and a CDN can use them.
  const src = pickVariantUrl(requested, width) ?? requested;
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
