import ExifReader from "exifreader";
import { readFujiRecipe, type FoundRecipe } from "@/lib/fuji/fuji-makernote";
import type { ExifData } from "@/lib/zine/types";

/** What the browser reads from a photo before upload. The recipe is not saved until the creator confirms it. */
export interface ExtractedPhoto {
  exif: ExifData | null;
  foundRecipe: FoundRecipe | null;
}

function tagText(tag: unknown): string | null {
  if (!tag || typeof tag !== "object") return null;
  const obj = tag as { description?: unknown; value?: unknown };
  if (typeof obj.description === "string" && obj.description.trim()) {
    return obj.description.trim();
  }
  if (typeof obj.description === "number") {
    return String(obj.description);
  }
  if (typeof obj.value === "string" && obj.value.trim()) {
    return obj.value.trim();
  }
  if (typeof obj.value === "number") {
    return String(obj.value);
  }
  return null;
}

function normalizeAperture(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.toLowerCase().startsWith("f/")) return raw;
  const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isNaN(numeric) && numeric > 0) {
    return `f/${Number(numeric.toFixed(1))}`;
  }
  return raw;
}

function normalizeShutter(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.endsWith("s")) return raw;
  return `${raw}s`;
}

function normalizeFocalLength(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.toLowerCase().includes("mm")) {
    return raw.replace(/\s+mm/i, "mm");
  }
  const numeric = Number.parseFloat(raw);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return `${Math.round(numeric)}mm`;
  }
  return raw;
}

/**
 * Reads camera EXIF and any Fujifilm recipe in the browser before upload,
 * so the original file can stream straight to storage without server buffering.
 * The recipe is returned for the creator to review. This function does not save it.
 */
export async function extractExifFromFile(file: File): Promise<ExtractedPhoto> {
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { exif: null, foundRecipe: null };
  }
  // Copy first: ExifReader may detach the buffer it is given.
  const foundRecipe = readFujiRecipe(buffer.slice(0));
  return { exif: readStandardExif(buffer), foundRecipe };
}

function readStandardExif(buffer: ArrayBuffer): ExifData | null {
  try {
    const tags = ExifReader.load(buffer);

    const isoRaw =
      tagText(tags.ISOSpeedRatings) ??
      tagText(tags.PhotographicSensitivity) ??
      tagText(tags.ISO);
    const apertureRaw =
      tagText(tags.FNumber) ?? tagText(tags.ApertureValue) ?? null;
    const shutterRaw =
      tagText(tags.ExposureTime) ?? tagText(tags.ShutterSpeedValue) ?? null;
    const focalRaw =
      tagText(tags.FocalLength) ??
      tagText(tags.FocalLengthIn35mmFilm) ??
      null;

    const exif: ExifData = {
      iso: isoRaw,
      aperture: normalizeAperture(apertureRaw),
      shutterSpeed: normalizeShutter(shutterRaw),
      focalLength: normalizeFocalLength(focalRaw),
      cameraMake: tagText(tags.Make),
      cameraModel: tagText(tags.Model),
      lens: tagText(tags.LensModel),
      takenAt: tagText(tags.DateTimeOriginal),
    };

    const hasValues = Object.values(exif).some(
      (v) => v !== null && v !== undefined && String(v).trim() !== ""
    );
    return hasValues ? exif : null;
  } catch {
    return null;
  }
}
