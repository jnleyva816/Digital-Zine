import crypto from "node:crypto";
import { LocalStorageDriver } from "./local";
import { S3StorageDriver } from "./s3";
import type { StorageDriver } from "./types";

export function isS3Configured(): boolean {
  return Boolean(
    process.env.AWS_S3_BUCKET?.trim() &&
      process.env.AWS_REGION?.trim() &&
      process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim()
  );
}

export function getStorageDriver(): StorageDriver {
  if (isS3Configured()) {
    return new S3StorageDriver({
      bucket: process.env.AWS_S3_BUCKET!.trim(),
      region: process.env.AWS_REGION!.trim(),
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!.trim(),
      endpoint: process.env.AWS_S3_ENDPOINT?.trim() || undefined,
      publicBaseUrl: process.env.AWS_S3_PUBLIC_URL?.trim() || undefined,
    });
  }
  return new LocalStorageDriver();
}

export function buildStorageKey(userId: string, filename: string): string {
  const extMatch = filename.toLowerCase().match(/\.(jpe?g|png|webp|gif|avif)$/);
  const ext = extMatch ? extMatch[0] : ".jpg";
  const safeStem =
    filename
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "asset";
  const uid = crypto.randomBytes(6).toString("hex");
  return `users/${userId}/${Date.now()}-${uid}-${safeStem}${ext}`;
}
