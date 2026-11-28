import {
  COLOR_CHROME_LEVELS,
  DYNAMIC_RANGES,
  GRAIN_EFFECTS,
  TONE_SETTINGS,
  WB_SHIFT_RANGE,
  recipeRows,
  type FujiRecipe,
  type ToneKey,
} from "@/lib/fuji/fuji-recipe";
import type { ExifData } from "@/lib/zine/types";

/** How a setting is drawn on a film card (DIG-52). The drawing only repeats the value, which is always text too. */
export type Drawing =
  | { kind: "scale"; min: number; max: number; at: number }
  | { kind: "steps"; count: number; at: number }
  | { kind: "shift"; red: number; blue: number; limit: number };

export interface FilmCardSetting {
  label: string;
  value: string;
  drawing: Drawing | null;
}

/** Where a value sits on a scale, from 0 to 1. */
export function scalePosition(at: number, min: number, max: number): number {
  return Math.min(1, Math.max(0, (at - min) / (max - min)));
}

function steps(options: readonly string[], value: string): Drawing | null {
  const at = options.indexOf(value);
  return at < 0 ? null : { kind: "steps", count: options.length, at };
}

function drawingFor(label: string, value: string, recipe: FujiRecipe): Drawing | null {
  if (label === "Dynamic Range") return steps(DYNAMIC_RANGES, value);
  if (label === "Grain Effect") return steps(GRAIN_EFFECTS, value);
  if (label === "Color Chrome Effect" || label === "Color Chrome FX Blue") return steps(COLOR_CHROME_LEVELS, value);
  if (label === "White Balance" && recipe.whiteBalance) {
    return { kind: "shift", red: recipe.whiteBalance.red, blue: recipe.whiteBalance.blue, limit: WB_SHIFT_RANGE.max };
  }
  const tone = (Object.keys(TONE_SETTINGS) as ToneKey[]).find((key) => TONE_SETTINGS[key].label === label);
  const at = tone ? recipe[tone] : undefined;
  return tone && at !== undefined ? { kind: "scale", min: TONE_SETTINGS[tone].min, max: TONE_SETTINGS[tone].max, at } : null;
}

/** Every setting after the film simulation, which is the card's headline. */
export function recipeSettings(recipe: FujiRecipe): FilmCardSetting[] {
  return recipeRows(recipe)
    .filter((row) => row.label !== "Film Simulation")
    .map((row) => ({ ...row, drawing: drawingFor(row.label, row.value, recipe) }));
}

/** A recipe as Fujifilm shooters share it: the name, then one setting per line. */
export function copyRecipeText(recipe: FujiRecipe): string {
  return [recipe.name, "", ...recipeRows(recipe).map((row) => `${row.label}: ${row.value}`)].join("\n");
}

/** "X-T5 · Classic Chrome", or whichever half is known. */
export function shotOnLabel(exif: ExifData | null, recipe: FujiRecipe | null): string | null {
  return [exif?.cameraModel?.trim(), recipe?.filmSimulation].filter(Boolean).join(" · ") || null;
}
