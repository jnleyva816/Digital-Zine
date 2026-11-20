import { prisma } from "@/lib/prisma";
import { variantKeys } from "@/lib/media/variant-urls";
import { getStorageDriver } from "@/lib/storage";

/**
 * Every file a photo can have in storage (DIG-40). A processed photo's key is its full AVIF, and
 * its other copies sit next to it. An unprocessed or older photo's key is its original JPEG, and
 * the worker may already have written copies under a folder of the same name.
 */
export function storedKeysFor(storageKey: string): string[] {
  const processed = /^(.*)\/full\.avif$/.exec(storageKey);
  const copies = variantKeys(processed ? `${processed[1]}.jpg` : storageKey);
  const keys = [copies.full, copies.og, ...Object.values(copies.widths)];
  return processed ? keys : [storageKey, ...keys];
}

/** Deletes files, logging any that fail rather than throwing: the database row is already gone. */
export async function deleteStoredFiles(keys: string[]): Promise<void> {
  const driver = getStorageDriver();
  for (const key of keys) {
    try {
      await driver.deleteObject(key);
    } catch (error) {
      console.error(`Could not delete stored file ${key}`, error);
    }
  }
}

/**
 * Deletes an account and every file in its storage folder (DIG-40). The row goes first, so a
 * failure part-way leaves orphaned files, never a signed-in account with missing photos.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } });
  try {
    await getStorageDriver().deletePrefix(`users/${userId}`);
  } catch (error) {
    console.error(`Could not delete the stored files of account ${userId}`, error);
  }
}
