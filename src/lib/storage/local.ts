import fs from "node:fs/promises";
import path from "node:path";
import type { PreparedUpload, StorageDriver } from "./types";

function getRootDir(): string {
  const configured = process.env.LOCAL_STORAGE_DIR?.trim() || ".data/uploads";
  return path.resolve(process.cwd(), configured);
}

function resolveSafePath(storageKey: string): string {
  const root = getRootDir();
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
    const bytes = await fs.readFile(filePath);
    let contentType = guessContentType(storageKey);
    try {
      const metaRaw = await fs.readFile(`${filePath}.meta.json`, "utf8");
      const parsed = JSON.parse(metaRaw) as { contentType?: string };
      if (parsed.contentType) {
        contentType = parsed.contentType;
      }
    } catch {
      // Metadata sidecar is optional (e.g. seeded files).
    }
    return { bytes, contentType };
  } catch {
    return null;
  }
}

function guessContentType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}
