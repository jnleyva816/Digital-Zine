import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { publicZinePath } from "@/lib/public-zine-path";
import { absoluteUrl } from "@/lib/site";

// What is published changes all the time; build time knows nothing about it.
export const dynamic = "force-dynamic";

/** The protocol's limit for one sitemap file. Past this, split with `generateSitemaps`. */
const MAX_URLS = 50_000;
const PUBLIC_PAGES = ["/", "/terms", "/privacy"];

/**
 * sitemap.xml (DIG-106): the landing page, the legal pages, and every published zine at its public
 * address. Drafts, unpublished zines, and private zines are never selected. Saving a zine always updates `updatedAt`,
 * so `lastmod` follows renames and edits; the query reads three columns and nothing else.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const zines = await prisma.zine.findMany({
    // Private zines (DIG-112) are never listed.
    where: { published: true, visibility: "public", owner: { deactivatedAt: null } },
    select: { slug: true, updatedAt: true, owner: { select: { publicId: true } } },
    orderBy: { updatedAt: "desc" },
    take: MAX_URLS - PUBLIC_PAGES.length,
  });

  return [
    ...PUBLIC_PAGES.map((path) => ({ url: absoluteUrl(path) })),
    ...zines.map((zine) => ({
      url: absoluteUrl(publicZinePath(zine.owner.publicId, zine.slug)),
      lastModified: zine.updatedAt,
    })),
  ];
}
