import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { parseExif, parsePageContent, parseRecipe, type ExifData, type RecipeData } from "@/lib/types";

const SHARE_DESCRIPTION_MAX = 200;

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
  imageUrl: string;
  caption: string;
  flipEnabled: boolean;
  kind: "photo" | "recipe";
  exif: ExifData | null;
  recipe: RecipeData | null;
}

export interface PublicZine {
  slug: string;
  title: string;
  description: string | null;
  ownerName: string | null;
  publishedAt: Date | null;
  pages: PublicZinePage[];
}

/**
 * A published zine as readers see it, or null when the slug is unknown or the zine is not
 * currently published. Cached per request so metadata and the page share one query.
 */
export const getPublicZine = cache(async (slug: string): Promise<PublicZine | null> => {
  const zine = await prisma.zine.findFirst({
    where: { slug, published: true },
    select: {
      slug: true,
      ownerId: true,
      title: true,
      description: true,
      publishedAt: true,
      owner: { select: { name: true } },
      pages: { orderBy: { pageNumber: "asc" }, select: { pageNumber: true, flipEnabled: true, content: true } },
    },
  });
  if (!zine) return null;

  const contents = zine.pages.map((p) => parsePageContent(p.content));
  const assetIds = contents.map((c) => c.assetId).filter(Boolean);
  // Only the owner's own assets may appear on their zine.
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: assetIds }, ownerId: zine.ownerId },
    select: { id: true, publicUrl: true, kind: true, exif: true, recipe: true },
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
      imageUrl: asset.publicUrl,
      caption: contents[i].caption?.trim() ?? "",
      flipEnabled: p.flipEnabled,
      kind: asset.kind === "recipe" ? "recipe" : "photo",
      exif: parseExif(asset.exif),
      recipe: parseRecipe(asset.recipe),
    });
  });

  return {
    slug: zine.slug,
    title: zine.title,
    description: zine.description,
    ownerName: zine.owner.name?.trim() || null,
    publishedAt: zine.publishedAt,
    pages,
  };
});
