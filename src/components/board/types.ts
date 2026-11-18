import { parseExif, parseRecipe, type ExifData, type RecipeData } from "@/lib/types";

/** Serializable shape of a Vision Board asset, shared by the server page and client board. */
export interface BoardAsset {
  id: string;
  publicUrl: string;
  originalName: string | null;
  kind: "photo" | "recipe";
  exif: ExifData | null;
  recipe: RecipeData | null;
  /** Bytes in storage (DIG-32). */
  sizeBytes: number;
}

interface RawAsset {
  id: string;
  publicUrl: string;
  originalName?: string | null;
  kind: string;
  exif?: unknown;
  recipe?: unknown;
  sizeBytes?: number;
}

export function toBoardAsset(raw: RawAsset): BoardAsset {
  return {
    id: raw.id,
    publicUrl: raw.publicUrl,
    originalName: raw.originalName ?? null,
    kind: raw.kind === "recipe" ? "recipe" : "photo",
    exif: parseExif(raw.exif),
    recipe: parseRecipe(raw.recipe),
    sizeBytes: raw.sizeBytes ?? 0,
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
