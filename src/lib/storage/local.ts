import fs from "node:fs/promises";
import path from "node:path";
import type { PreparedUpload, StorageDriver } from "./types";

function getRootDir(): string {
  const configured = process.env.LOCAL_STORAGE_DIR?.trim() || ".data/uploads";
  return path.resolve(process.cwd(), configured);
}

function resolveSafePath(storageKey: string): string {
  const root = getRootDir();
  // Never follow "." or ".." segments, even ones that stay inside the root (DIG-35).
  if (storageKey.split(/[\\/]/).some((segment) => segment === "." || segment === "..")) {
    throw new Error("Invalid storage key path");
  }
  const normalizedKey = storageKey.replace(/^\/+/, "");
  const resolved = path.resolve(root, normalizedKey);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid storage key path");
  }
  return resolved;
}

function encodeKeyPath(storageKey: string): string {
  return storageKey
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export class LocalStorageDriver implements StorageDriver {
  readonly name = "local" as const;

  getPublicUrl(storageKey: string): string {
    return `/api/media/${encodeKeyPath(storageKey)}`;
  }

  async getObjectSize(storageKey: string): Promise<number | null> {
    try {
      const stat = await fs.stat(resolveSafePath(storageKey));
      return stat.isFile() ? stat.size : null;
    } catch {
      return null;
    }
  }

  async getObject(storageKey: string): Promise<Buffer | null> {
    return (await readLocalObject(storageKey))?.bytes ?? null;
  }

  async putObject(storageKey: string, bytes: Buffer, contentType: string): Promise<void> {
    await writeLocalObject(storageKey, bytes, contentType);
  }

  async deletePrefix(prefix: string): Promise<void> {
    await fs.rm(resolveSafePath(prefix.replace(/\/+$/, "")), { recursive: true, force: true });
  }

  async deleteObject(storageKey: string): Promise<void> {
    const filePath = resolveSafePath(storageKey);
    await fs.rm(filePath, { force: true });
    await fs.rm(`${filePath}.meta.json`, { force: true });
  }

  async prepareUpload(params: {
    storageKey: string;
    contentType: string;
  }): Promise<PreparedUpload> {
    const encoded = encodeKeyPath(params.storageKey);
    return {
      driver: "local",
      storageKey: params.storageKey,
      uploadUrl: `/api/uploads/local/${encoded}`,
      method: "PUT",
      headers: {
        "Content-Type": params.contentType || "application/octet-stream",
      },
      publicUrl: this.getPublicUrl(params.storageKey),
    };
  }
}

export async function writeLocalObject(
  storageKey: string,
  bytes: Buffer,
  contentType?: string
): Promise<void> {
  const filePath = resolveSafePath(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
  if (contentType) {
    await fs.writeFile(`${filePath}.meta.json`, JSON.stringify({ contentType }));
  }
}

export async function readLocalObject(
  storageKey: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const filePath = resolveSafePath(storageKey);
  try {
    // The type comes from the extension, never from the sidecar a client could write (DIG-36).
    // Only the types the app itself stores are ever served.
    const contentType = contentTypeForKey(storageKey);
    if (!contentType) return null;
    const bytes = await fs.readFile(filePath);
    return { bytes, contentType };
  } catch {
    return null;
  }
}

/**
 * The content type of a stored file, from its extension, or null for anything the app does not
 * store (DIG-36): uploads are JPEG, and the worker writes AVIF copies and a JPEG share image.
 */
export function contentTypeForKey(key: string): "image/jpeg" | "image/avif" | null {
  const lower = key.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".avif")) return "image/avif";
  return null;
}
