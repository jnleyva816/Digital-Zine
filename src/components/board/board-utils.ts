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

/** A grid card's one line: the recipe, then the camera's settings (DIG-90). */
export function photoMeta(asset: BoardAsset): string {
  const recipe = asset.kind === "recipe" && asset.recipe ? [asset.recipe.name, asset.recipe.filmSimulation] : [];
  const camera = [asset.exif?.cameraMake, asset.exif?.cameraModel].filter(Boolean).join(" ");
  const file = asset.name?.trim() ? asset.originalName : null;
  return [...recipe, ...exifBadges(asset.exif), camera, file].filter(Boolean).join(" · ") || "No camera details";
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

/** A phone card's camera line: the camera and aperture, or every setting (DIG-93). */
export function cameraLine({ exif }: BoardAsset, detail: "short" | "full"): string {
  const iso = exif?.iso !== null && exif?.iso !== undefined && String(exif.iso).trim() ? `ISO ${exif.iso}` : null;
  const parts = detail === "short" ? [exif?.cameraModel, exif?.aperture, exif?.cameraModel ? null : iso] : [exif?.cameraModel, exif?.focalLength, exif?.aperture, exif?.shutterSpeed, iso];
  return parts.filter(Boolean).join(" · ") || "No camera details";
}
