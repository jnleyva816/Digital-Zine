import ExifReader from "exifreader";
import type { ExifData } from "@/lib/types";

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
 * Extracts camera EXIF metadata directly in the browser before upload
 * so the original file can stream straight to storage without server buffering.
 */
export async function extractExifFromFile(
  file: File
): Promise<ExifData | null> {
  try {
    const buffer = await file.arrayBuffer();
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
