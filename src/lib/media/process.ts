import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/lib/storage";
import { renderVariants, variantKeys } from "./variants";
import { revalidateZinesUsingAssets } from "@/lib/public-zine-cache";

const MISSING = "The uploaded file is missing. Delete this photo and upload it again.";
const UNREADABLE = "This file could not be read as an image.";
const STORAGE_FAILED = "The photo could not be saved. Try again.";

async function fail(assetId: string, processingError: string) {
  await prisma.mediaAsset.updateMany({ where: { id: assetId, status: "processing" }, data: { status: "failed", processingError } });
}

/**
 * The worker's job for one upload (DIG-26). It renders the AVIF copies, stores them, points the
 * photo at the full-resolution copy, and only then deletes the original. EXIF and the recipe were
 * read in the browser before upload and are already saved, so nothing is lost with the original.
 * Failures are recorded on the photo, where the owner can retry; this never throws for them.
 */
export async function processAsset(assetId: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status !== "processing") return;

  const driver = getStorageDriver();
  const original = await driver.getObject(asset.storageKey);
  if (!original) return fail(asset.id, MISSING);

  let rendered: Awaited<ReturnType<typeof renderVariants>>;
  try {
    rendered = await renderVariants(original);
  } catch {
    return fail(asset.id, UNREADABLE);
  }

  const keys = variantKeys(asset.storageKey);
  const outputs: [string, Buffer, string][] = [
    [keys.full, rendered.full.bytes, "image/avif"],
    [keys.og, rendered.og.bytes, "image/jpeg"],
    ...rendered.widths.map((w): [string, Buffer, string] => [keys.widths[w.width]!, w.bytes, "image/avif"]),
  ];
  const removeOutputs = () => Promise.all(outputs.map(([key]) => driver.deleteObject(key)));

  try {
    for (const [key, bytes, type] of outputs) await driver.putObject(key, bytes, type);
  } catch (error) {
    console.error(`Media processing: could not store copies of ${asset.id}`, error);
    await removeOutputs().catch(() => undefined);
    return fail(asset.id, STORAGE_FAILED);
  }

  const saved = await prisma.mediaAsset.updateMany({
    where: { id: asset.id, status: "processing" },
    data: {
      status: "ready",
      processingError: null,
      storageKey: keys.full,
      publicUrl: driver.getPublicUrl(keys.full),
      mimeType: "image/avif",
      width: rendered.full.width,
      height: rendered.full.height,
      blurDataUrl: rendered.blurDataUrl,
      sizeBytes: outputs.reduce((sum, [, bytes]) => sum + bytes.length, 0),
    },
  });
  if (saved.count === 0) {
    // The photo was deleted (or reset) while it was processing; its copies and the original
    // would only cost money (DIG-40).
    await removeOutputs();
    await driver.deleteObject(asset.storageKey);
    return;
  }
  // Zines showing this photo now point at the AVIF; refresh their cached pages before the
  // original goes away (DIG-27).
  await revalidateZinesUsingAssets([asset.id]);
  await driver.deleteObject(asset.storageKey);
}
