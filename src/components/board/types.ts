import { parseExif, parseRecipe, type ExifData, type RecipeData } from "@/lib/types";

/** Serializable shape of a Vision Board asset, shared by the server page and client board. */
export interface BoardAsset {
  id: string;
  publicUrl: string;
  originalName: string | null;
  kind: "photo" | "recipe";
  exif: ExifData | null;
  recipe: RecipeData | null;
}

interface RawAsset {
  id: string;
  publicUrl: string;
  originalName?: string | null;
  kind: string;
  exif?: unknown;
  recipe?: unknown;
}

export function toBoardAsset(raw: RawAsset): BoardAsset {
  return {
    id: raw.id,
    publicUrl: raw.publicUrl,
    originalName: raw.originalName ?? null,
    kind: raw.kind === "recipe" ? "recipe" : "photo",
    exif: parseExif(raw.exif),
    recipe: parseRecipe(raw.recipe),
  };
}

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/** Matches the server limit in `PUT /api/uploads/local/[...key]`. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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
