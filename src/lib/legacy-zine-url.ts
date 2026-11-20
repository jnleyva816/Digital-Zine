import { prisma } from "@/lib/prisma";

/**
 * Where an old `/z/<slug>` link now lives (DIG-102). Before creators were in the address a slug
 * belonged to one zine across the whole site. Slugs are only unique per creator now, so when
 * several creators share one, the oldest published zine wins: that is the one that held it then.
 * Null when no published zine has the slug.
 */
export async function legacyZineAddress(slug: string): Promise<{ owner: string; slug: string } | null> {
  const zine = await prisma.zine.findFirst({
    where: { slug, published: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { slug: true, owner: { select: { publicId: true } } },
  });
  return zine ? { owner: zine.owner.publicId, slug: zine.slug } : null;
}
