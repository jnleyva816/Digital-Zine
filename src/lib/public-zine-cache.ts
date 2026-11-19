import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { publicZineTag } from "@/lib/public-zine";

type IncrementalCacheHandle = { revalidateTag?: (tags: string[]) => Promise<void> };

/**
 * Drops the cached public pages for these slugs (DIG-27), so the next view reads the database.
 *
 * Route handlers use `revalidateTag`. The media worker runs outside any request, where
 * `revalidateTag` throws; there it uses the server's incremental cache directly, which Next keeps
 * on `globalThis.__incrementalCache` once the server has handled a request. If neither is
 * available, the page's one-hour max age still refreshes it.
 */
export async function revalidatePublicZines(slugs: Iterable<string>): Promise<void> {
  for (const slug of new Set(slugs)) {
    const tag = publicZineTag(slug);
    try {
      revalidateTag(tag);
    } catch {
      const cache = (globalThis as { __incrementalCache?: IncrementalCacheHandle }).__incrementalCache;
      await cache?.revalidateTag?.([tag]).catch((error: unknown) => {
        console.error(`Could not refresh the cached page for ${slug}`, error);
      });
    }
  }
}

/** Drops the cached public pages of every zine whose pages show any of these photos. */
export async function revalidateZinesUsingAssets(assetIds: string[]): Promise<void> {
  if (assetIds.length === 0) return;
  const zines = await prisma.zine.findMany({
    where: { pages: { some: { OR: assetIds.map((id) => ({ content: { path: ["assetId"], equals: id } })) } } },
    select: { slug: true },
  });
  await revalidatePublicZines(zines.map((z) => z.slug));
}
