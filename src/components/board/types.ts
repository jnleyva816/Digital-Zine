import { parseExif, parseRecipe, type ExifData, type RecipeData } from "@/lib/types";
import { parsePhotoEdit, type PhotoEdit } from "@/lib/photo-edit";

/** Serializable shape of a Vision Board asset, shared by the server page and client board. */
export interface BoardAsset {
  id: string;
  publicUrl: string;
  originalName: string | null;
  /** The creator's name for the photo, or null to use the file name (DIG-34). */
  name: string | null;
  kind: "photo" | "recipe";
  exif: ExifData | null;
  recipe: RecipeData | null;
  /** The saved recipe this photo is linked to (DIG-24); `recipe` holds a copy of it. */
  recipeId: string | null;
  /** Bytes in storage (DIG-32). */
  sizeBytes: number;
  /** DIG-26: `processing` until the AVIF copies exist. */
  status: "processing" | "ready" | "failed";
  processingError: string | null;
  blurDataUrl: string | null;
  /** Crop, frame, and card size (DIG-33); null when unedited. */
  edit: PhotoEdit | null;
  /** Pixel size, when known. Crops need it. */
  width: number | null;
  height: number | null;
}

interface RawAsset {
  id: string;
  publicUrl: string;
  originalName?: string | null;
  name?: string | null;
  kind: string;
  exif?: unknown;
  recipe?: unknown;
  recipeId?: string | null;
  sizeBytes?: number;
  status?: string;
  processingError?: string | null;
  blurDataUrl?: string | null;
  edit?: unknown;
  width?: number | null;
  height?: number | null;
}

export function toBoardAsset(raw: RawAsset): BoardAsset {
  return {
    id: raw.id,
    publicUrl: raw.publicUrl,
    originalName: raw.originalName ?? null,
    name: raw.name ?? null,
    kind: raw.kind === "recipe" ? "recipe" : "photo",
    exif: parseExif(raw.exif),
    recipe: parseRecipe(raw.recipe),
    recipeId: raw.recipeId ?? null,
    sizeBytes: raw.sizeBytes ?? 0,
    status: raw.status === "processing" || raw.status === "failed" ? raw.status : "ready",
    processingError: raw.processingError ?? null,
    blurDataUrl: raw.blurDataUrl ?? null,
    edit: parsePhotoEdit(raw.edit),
    width: raw.width ?? null,
    height: raw.height ?? null,
  };
}

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/** Reads `{ error }` from a JSON error response, falling back to a generic message. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body) {
      const error = (body as { error: unknown }).error;
      if (typeof error === "string" && error.trim()) return error;
    }
  } catch {
    // Non-JSON body; use the fallback.
  }
  return fallback;
}
