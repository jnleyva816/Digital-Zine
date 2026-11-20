import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { publicZineTag } from "@/lib/public-zine";

type IncrementalCacheHandle = { revalidateTag?: (tags: string[]) => Promise<void> };

/** A zine's public address: its creator's public ID and its slug (DIG-102). */
export interface ZineAddress {
  owner: string;
  slug: string;
}

/**
 * Drops the cached public pages for these zines (DIG-27), so the next view reads the database.
 *
 * Route handlers use `revalidateTag`. The media worker runs outside any request, where
 * `revalidateTag` throws; there it uses the server's incremental cache directly, which Next keeps
 * on `globalThis.__incrementalCache` once the server has handled a request. If neither is
 * available, the page's one-hour max age still refreshes it.
 */
export async function revalidatePublicZines(addresses: Iterable<ZineAddress>): Promise<void> {
  const tags = new Map<string, ZineAddress>();
  for (const address of addresses) tags.set(publicZineTag(address.owner, address.slug), address);
  for (const [tag, address] of tags) {
    try {
      revalidateTag(tag);
    } catch {
      const cache = (globalThis as { __incrementalCache?: IncrementalCacheHandle }).__incrementalCache;
      await cache?.revalidateTag?.([tag]).catch((error: unknown) => {
        console.error(`Could not refresh the cached page for ${address.owner}/${address.slug}`, error);
      });
    }
  }
}

/** Drops the cached public pages of every zine whose pages show any of these photos. */
export async function revalidateZinesUsingAssets(assetIds: string[]): Promise<void> {
  if (assetIds.length === 0) return;
  const zines = await prisma.zine.findMany({
    where: { pages: { some: { OR: assetIds.map((id) => ({ content: { path: ["assetId"], equals: id } })) } } },
    select: { slug: true, owner: { select: { publicId: true } } },
  });
  await revalidatePublicZines(zines.map((z) => ({ owner: z.owner.publicId, slug: z.slug })));
}
