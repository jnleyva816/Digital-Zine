import type { ExifData } from "@/lib/types";
import type { BoardAsset } from "./types";

export function assetLabel(asset: BoardAsset, index: number): string {
  return asset.name?.trim() || asset.originalName?.trim() || `Photo ${index + 1}`;
}

export function exifBadges(exif: ExifData | null): string[] {
  if (!exif) return [];
  return [
    exif.iso !== null && exif.iso !== undefined && String(exif.iso).trim() ? `ISO ${exif.iso}` : null,
    exif.aperture,
    exif.shutterSpeed,
    exif.focalLength,
  ].filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** "“A”", "“A” and “B”", "“A”, “B”, and “C”". */
export function quoteList(titles: string[]): string {
  const quoted = titles.map((t) => `“${t}”`);
  if (quoted.length <= 2) return quoted.join(" and ");
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted.at(-1)}`;
}
