import { parseFujiRecipe, type FujiRecipe } from "../fuji/fuji-recipe";

export const ZINE_TEMPLATE_ID = "full-bleed-photo" as const;
export type ZineTemplateId = typeof ZINE_TEMPLATE_ID;

export interface ExifData {
  iso?: string | number | null;
  aperture?: string | null;
  shutterSpeed?: string | null;
  focalLength?: string | null;
  cameraMake?: string | null;
  cameraModel?: string | null;
  lens?: string | null;
  takenAt?: string | null;
}

/** A Fujifilm film-simulation recipe (DIG-22). See `src/lib/fuji/fuji-recipe.ts`. */
export type RecipeData = FujiRecipe;

export interface ZinePageContent {
  assetId: string;
  caption?: string;
}

export function parseExif(raw: unknown): ExifData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const data: ExifData = {
    iso:
      typeof obj.iso === "number" || typeof obj.iso === "string"
        ? obj.iso
        : null,
    aperture: typeof obj.aperture === "string" ? obj.aperture : null,
    shutterSpeed:
      typeof obj.shutterSpeed === "string" ? obj.shutterSpeed : null,
    focalLength: typeof obj.focalLength === "string" ? obj.focalLength : null,
    cameraMake: typeof obj.cameraMake === "string" ? obj.cameraMake : null,
    cameraModel: typeof obj.cameraModel === "string" ? obj.cameraModel : null,
    lens: typeof obj.lens === "string" ? obj.lens : null,
    takenAt: typeof obj.takenAt === "string" ? obj.takenAt : null,
  };
  const hasAny = Object.values(data).some(
    (v) => v !== null && v !== undefined && String(v).trim() !== ""
  );
  return hasAny ? data : null;
}

/** A stored Fujifilm recipe, or null (old food recipes are dropped). */
export function parseRecipe(raw: unknown): RecipeData | null {
  return parseFujiRecipe(raw);
}

export function parsePageContent(raw: unknown): ZinePageContent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { assetId: "", caption: "" };
  }
  const obj = raw as Record<string, unknown>;
  return {
    assetId: typeof obj.assetId === "string" ? obj.assetId : "",
    caption: typeof obj.caption === "string" ? obj.caption : "",
  };
}

export function slugifyTitle(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "untitled-zine"
  );
}
