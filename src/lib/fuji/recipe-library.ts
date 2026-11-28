import type { FujiRecipe } from "./fuji-recipe";

/** A recipe in the creator's library (DIG-24), with how many photos are linked to it. */
export interface SavedRecipe {
  id: string;
  recipe: FujiRecipe;
  photoCount: number;
}

type Settings = Omit<FujiRecipe, "name">;

/** The camera does not record these in its maker notes, so they never decide a match. */
const NOT_IN_MAKER_NOTES = new Set(["name", "iso", "exposureCompensation"]);

/** A stable string of the settings the camera records, with unset ones left out. */
function fingerprint(recipe: Settings): string {
  const entries = Object.entries(recipe)
    .filter(([key, value]) => !NOT_IN_MAKER_NOTES.has(key) && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [
      key,
      value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value,
    ]);
  return JSON.stringify(entries);
}

/** Whether two recipes have the same in-camera settings, ignoring name, ISO, and exposure. */
export function sameSettings(a: Settings, b: Settings): boolean {
  return fingerprint(a) === fingerprint(b);
}

/** The saved recipe whose settings match those read from a photo, or null. Client-safe. */
export function matchSavedRecipe(found: Settings | null, library: SavedRecipe[]): SavedRecipe | null {
  if (!found) return null;
  return library.find((saved) => sameSettings(found, saved.recipe)) ?? null;
}
