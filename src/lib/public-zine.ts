import { cache } from "react";
import { unstable_cache } from "next/cache";
import { shareImageUrl } from "@/lib/media/variant-urls";
import { prisma } from "@/lib/prisma";
import { parsePhotoEdit, type PhotoEdit } from "@/lib/photo-edit";
import { parseExif, parsePageContent, parseRecipe, type ExifData, type RecipeData } from "@/lib/types";

const SHARE_DESCRIPTION_MAX = 200;

/**
 * Cache tag for one zine's public page (DIG-27). Revalidate it whenever what readers see changes.
 * A slug is only unique per creator (DIG-102), so the creator is part of the tag.
 */
export const publicZineTag = (owner: string, slug: string) => `public-zine:${owner}/${slug}`;

/** A safety net: even if an invalidation is missed, a cached page is rebuilt within the hour. */
const PUBLIC_ZINE_MAX_AGE_SECONDS = 3600;

/** The description used for search results and share cards. */
export function shareDescription({
  description,
  ownerName,
  pageCount,
}: {
  description: string | null;
  ownerName: string | null;
  pageCount: number;
}): string {
  const own = description?.trim();
  if (own) {
    return own.length > SHARE_DESCRIPTION_MAX ? `${own.slice(0, SHARE_DESCRIPTION_MAX - 1).trimEnd()}…` : own;
  }
  const name = ownerName?.trim();
  const pages = `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;
  return name ? `A digital zine by ${name} · ${pages}` : `A digital zine · ${pages}`;
}

export interface PublicZinePage {
  pageNumber: number;
  /** The creator's name for the photo, or null. Never the camera's file name (DIG-34). */
  name: string | null;
  imageUrl: string;
  /** JPEG for link previews (DIG-26). */
  shareImageUrl: string;
  blurDataUrl: string | null;
  /** Crop and frame (DIG-33), and the photo's pixel size when known. */
  edit: PhotoEdit | null;
  dims: { width: number; height: number } | null;
  caption: string;
  flipEnabled: boolean;
  kind: "photo" | "recipe";
  exif: ExifData | null;
  recipe: RecipeData | null;
}

export interface PublicZine {
  /** The creator's public ID: the first part of the zine's address (DIG-102). */
  owner: string;
  slug: string;
  title: string;
  description: string | null;
  ownerName: string | null;
  /** ISO date. A string, not a Date, because the page data is cached as JSON (DIG-27). */
  publishedAt: string | null;
  pages: PublicZinePage[];
}

/**
 * A published zine as readers see it, or null when the creator or slug is unknown or the zine is
 * not currently published. Served from the data cache (DIG-27) and shared by the metadata and the
 * page within a request; every change readers would see revalidates `publicZineTag(owner, slug)`.
 * `owner` is the creator's public ID (DIG-102).
 */
export const getPublicZine = cache((owner: string, slug: string): Promise<PublicZine | null> =>
  unstable_cache(() => loadPublicZine(owner, slug), ["public-zine", owner, slug], {
    tags: [publicZineTag(owner, slug)],
    revalidate: PUBLIC_ZINE_MAX_AGE_SECONDS,
  })()
);

async function loadPublicZine(owner: string, slug: string): Promise<PublicZine | null> {
  const zine = await prisma.zine.findFirst({
    where: { slug, published: true, owner: { publicId: owner } },
    select: {
      slug: true,
      ownerId: true,
      title: true,
      description: true,
      publishedAt: true,
      owner: { select: { name: true, publicId: true } },
      pages: { orderBy: { pageNumber: "asc" }, select: { pageNumber: true, flipEnabled: true, content: true } },
    },
  });
  if (!zine) return null;

  const contents = zine.pages.map((p) => parsePageContent(p.content));
  const assetIds = contents.map((c) => c.assetId).filter(Boolean);
  // Only the owner's own assets may appear on their zine.
  const assets = await prisma.mediaAsset.findMany({
    // Only processed photos: an unprocessed original still carries all its EXIF, GPS included
    // (DIG-38). A page whose photo is processing or failed is skipped, like a missing one.
    where: { id: { in: assetIds }, ownerId: zine.ownerId, status: "ready" },
    select: {
      id: true,
      name: true,
      publicUrl: true,
      blurDataUrl: true,
      kind: true,
      exif: true,
      recipe: true,
      edit: true,
      width: true,
      height: true,
    },
  });
  const byId = new Map(assets.map((a) => [a.id, a]));

  // A page whose asset is gone is skipped rather than shown broken; deletes are blocked
  // while a page uses an asset, so this only guards against out-of-band changes.
  const pages: PublicZinePage[] = [];
  zine.pages.forEach((p, i) => {
    const asset = byId.get(contents[i].assetId);
    if (!asset) return;
    pages.push({
      pageNumber: pages.length + 1,
      name: asset.name?.trim() || null,
      imageUrl: asset.publicUrl,
      shareImageUrl: shareImageUrl(asset.publicUrl),
      blurDataUrl: asset.blurDataUrl,
      edit: parsePhotoEdit(asset.edit),
      dims: asset.width && asset.height ? { width: asset.width, height: asset.height } : null,
      caption: contents[i].caption?.trim() ?? "",
      flipEnabled: p.flipEnabled,
      kind: asset.kind === "recipe" ? "recipe" : "photo",
      exif: parseExif(asset.exif),
      recipe: parseRecipe(asset.recipe),
    });
  });

  return {
    owner: zine.owner.publicId,
    slug: zine.slug,
    title: zine.title,
    description: zine.description,
    ownerName: zine.owner.name?.trim() || null,
    publishedAt: zine.publishedAt?.toISOString() ?? null,
    pages,
  };
}
