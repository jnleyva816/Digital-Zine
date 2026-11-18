/**
 * Storage and plan limits (DIG-32). The owner may change these numbers later; they are code
 * constants, not database values, so a change needs no migration.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Largest single upload. Storage enforces it too: S3 signs the exact size, the local route checks it. */
export const MAX_UPLOAD_BYTES = 75 * MB;

/**
 * Storage per Vision Board. Each user has one board until DIG-25 adds more, so today this is
 * also the per-user cap.
 */
export const BOARD_STORAGE_BYTES = 2 * GB;

const ZINE_LIMITS: Record<"free" | "pro", number | null> = { free: 1, pro: null };

/** How many zines a tier may own. `null` means no limit. */
export function zineLimitFor(tier: "free" | "pro"): number | null {
  return ZINE_LIMITS[tier];
}

/** What a creator sees when their plan allows no more zines. */
export function zineLimitMessage(limit: number): string {
  return `Free includes ${limit} zine${limit === 1 ? "" : "s"}. Upgrade to Pro for unlimited zines.`;
}

export type UploadCheck =
  | { ok: true }
  | { ok: false; reason: "invalid_size" | "too_large" | "over_quota"; message: string };

/** Whether a file of `size` bytes may be added to a board that already holds `usedBytes`. */
export function checkUpload({ size, usedBytes }: { size: number; usedBytes: number }): UploadCheck {
  if (!Number.isSafeInteger(size) || size <= 0) {
    return { ok: false, reason: "invalid_size", message: "The file size is missing or invalid." };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      message: `This file is larger than the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`,
    };
  }
  if (usedBytes + size > BOARD_STORAGE_BYTES) {
    const left = Math.max(0, BOARD_STORAGE_BYTES - usedBytes);
    return {
      ok: false,
      reason: "over_quota",
      message: `Your board is full: ${formatBytes(left)} of ${formatBytes(BOARD_STORAGE_BYTES)} left. Delete photos to make room.`,
    };
  }
  return { ok: true };
}

/** "0.5 MB", "75 MB", "1.5 GB". One decimal at most. */
export function formatBytes(bytes: number): string {
  const round = (n: number) => String(Math.round(n * 10) / 10);
  return bytes >= GB ? `${round(bytes / GB)} GB` : `${round(bytes / MB)} MB`;
}
