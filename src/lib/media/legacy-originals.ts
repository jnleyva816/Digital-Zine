import { prisma } from "@/lib/prisma";
import { revalidateZinesUsingAssets } from "@/lib/public-zine-cache";
import { getStorageDriver } from "@/lib/storage";
import { cleanJpeg } from "./strip-metadata";

const CLEAN_SUFFIX = ".clean.jpg";

/**
 * Removes EXIF (GPS included) from photos uploaded before the image pipeline, which are still
 * served as their original JPEG (owner, 19 Nov; DIG-38). Each cleaned copy goes to a new address,
 * because media is served with a one-year immutable cache: the old address, and any copy cached
 * under it, then stops working. Only `ready` photos in creators' folders are touched; AVIF copies,
 * photos still processing or failed, and seed images are left alone. Safe to run again.
 */
export async function stripLegacyOriginals({ dryRun = false } = {}): Promise<{ cleaned: number }> {
  const driver = getStorageDriver();
  const legacy = await prisma.mediaAsset.findMany({
    where: {
      status: "ready",
      storageKey: { startsWith: "users/" },
      NOT: [{ storageKey: { endsWith: "/full.avif" } }, { storageKey: { endsWith: CLEAN_SUFFIX } }],
    },
    select: { id: true, storageKey: true },
  });

  let cleaned = 0;
  for (const asset of legacy) {
    if (!/\.jpe?g$/i.test(asset.storageKey)) continue;
    if (dryRun) {
      cleaned++;
      continue;
    }
    const bytes = await driver.getObject(asset.storageKey);
    if (!bytes) {
      console.warn(`Skipped ${asset.id}: its file ${asset.storageKey} is missing.`);
      continue;
    }
    const clean = await cleanJpeg(bytes);
    const newKey = asset.storageKey.replace(/\.jpe?g$/i, CLEAN_SUFFIX);
    await driver.putObject(newKey, clean, "image/jpeg");
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { storageKey: newKey, publicUrl: driver.getPublicUrl(newKey), sizeBytes: clean.length },
    });
    await driver.deleteObject(asset.storageKey);
    await revalidateZinesUsingAssets([asset.id]);
    cleaned++;
  }
  return { cleaned };
}
