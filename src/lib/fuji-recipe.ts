import { z } from "zod";

/**
 * Fujifilm film-simulation recipes (DIG-22): the in-camera settings the Fujifilm community shares
 * as "recipes". Options mirror the camera menus (X-Trans IV and V), so every value on a card back
 * is one a creator could dial in.
 */

export const FILM_SIMULATIONS = [
  "Provia/Standard",
  "Velvia/Vivid",
  "Astia/Soft",
  "Classic Chrome",
  "Reala Ace",
  "Pro Neg. Hi",
  "Pro Neg. Std",
  "Classic Neg.",
  "Nostalgic Neg.",
  "Eterna/Cinema",
  "Eterna Bleach Bypass",
  "Acros",
  "Acros + Ye",
  "Acros + R",
  "Acros + G",
  "Monochrome",
  "Monochrome + Ye",
  "Monochrome + R",
  "Monochrome + G",
  "Sepia",
] as const;

export const DYNAMIC_RANGES = ["DR-Auto", "DR100", "DR200", "DR400"] as const;
export const GRAIN_EFFECTS = ["Off", "Weak, Small", "Weak, Large", "Strong, Small", "Strong, Large"] as const;
export const COLOR_CHROME_LEVELS = ["Off", "Weak", "Strong"] as const;
export const WHITE_BALANCE_MODES = [
  "Auto",
  "Auto (White Priority)",
  "Auto (Ambience Priority)",
  "Daylight",
  "Shade",
  "Fluorescent 1",
  "Fluorescent 2",
  "Fluorescent 3",
  "Incandescent",
  "Underwater",
  "Kelvin",
] as const;

export const KELVIN_RANGE = { min: 2500, max: 10000, step: 10 } as const;
export const WB_SHIFT_RANGE = { min: -9, max: 9 } as const;

/** Each tone setting's range and step on the camera. */
export const TONE_SETTINGS = {
  highlight: { label: "Highlight", min: -2, max: 4, step: 0.5 },
  shadow: { label: "Shadow", min: -2, max: 4, step: 0.5 },
  color: { label: "Color", min: -4, max: 4, step: 1 },
  sharpness: { label: "Sharpness", min: -4, max: 4, step: 1 },
  clarity: { label: "Clarity", min: -5, max: 5, step: 1 },
  noiseReduction: { label: "Noise Reduction", min: -4, max: 4, step: 1 },
} as const;
export type ToneKey = keyof typeof TONE_SETTINGS;

/** All values in a range, low to high: `steps(-2, 4, 0.5)` → -2, -1.5, … 4. */
export function steps(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; min + i * step <= max + 1e-9; i++) out.push(Math.round((min + i * step) * 10) / 10);
  return out;
}

const AUTO_ISO_CEILINGS = [400, 800, 1600, 3200, 6400, 12800];
const FIXED_ISOS = [64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800];
export const ISO_OPTIONS: readonly string[] = [
  ...AUTO_ISO_CEILINGS.map((iso) => `Auto up to ISO ${iso}`),
  ...FIXED_ISOS.map((iso) => `ISO ${iso}`),
];

/** Third-stop exposure compensation from -3 to +3, written the way photographers write it. */
export const EXPOSURE_COMPENSATION: readonly string[] = steps(-9, 9, 1).map((thirds) => {
  if (thirds === 0) return "0";
  const sign = thirds > 0 ? "+" : "-";
  const whole = Math.floor(Math.abs(thirds) / 3);
  const rest = Math.abs(thirds) % 3;
  const fraction = rest ? `${rest}/3` : "";
  return `${sign}${whole ? whole : ""}${whole && fraction ? " " : ""}${fraction}`;
});

const onStep = (min: number, max: number, step: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .refine((n) => Math.abs((n - min) / step - Math.round((n - min) / step)) < 1e-9, {
      message: `Use steps of ${step}.`,
    });

const whiteBalanceSchema = z
  .object({
    mode: z.enum(WHITE_BALANCE_MODES),
    kelvin: onStep(KELVIN_RANGE.min, KELVIN_RANGE.max, KELVIN_RANGE.step).optional(),
    red: onStep(WB_SHIFT_RANGE.min, WB_SHIFT_RANGE.max, 1),
    blue: onStep(WB_SHIFT_RANGE.min, WB_SHIFT_RANGE.max, 1),
  })
  .strict()
  .refine((wb) => (wb.mode === "Kelvin") === (wb.kelvin !== undefined), {
    message: "Give a Kelvin temperature only when white balance is set to Kelvin.",
  });

/** A single third-stop value, or a range such as "0 to +2/3" (recipes are often shared that way). */
const exposureSchema = z.string().refine((value) => {
  const parts = value.split(" to ");
  if (parts.length > 2) return false;
  const idx = parts.map((p) => EXPOSURE_COMPENSATION.indexOf(p));
  return idx.every((i) => i >= 0) && (idx.length === 1 || idx[0] < idx[1]);
}, "Use third-stop values from -3 to +3, or a range such as \"0 to +2/3\".");

export const RECIPE_NAME_MAX = 80;

export const fujiRecipeSchema = z
  .object({
    name: z.string().trim().min(1, "Give the recipe a name.").max(RECIPE_NAME_MAX, `Keep the name to ${RECIPE_NAME_MAX} characters or fewer.`),
    filmSimulation: z.enum(FILM_SIMULATIONS),
    dynamicRange: z.enum(DYNAMIC_RANGES).optional(),
    grain: z.enum(GRAIN_EFFECTS).optional(),
    colorChrome: z.enum(COLOR_CHROME_LEVELS).optional(),
    colorChromeFxBlue: z.enum(COLOR_CHROME_LEVELS).optional(),
    whiteBalance: whiteBalanceSchema.optional(),
    highlight: onStep(-2, 4, 0.5).optional(),
    shadow: onStep(-2, 4, 0.5).optional(),
    color: onStep(-4, 4, 1).optional(),
    sharpness: onStep(-4, 4, 1).optional(),
    clarity: onStep(-5, 5, 1).optional(),
    noiseReduction: onStep(-4, 4, 1).optional(),
    iso: z.string().refine((v) => ISO_OPTIONS.includes(v), "Pick an ISO the camera offers.").optional(),
    exposureCompensation: exposureSchema.optional(),
  })
  .strict();

export type FujiRecipe = z.infer<typeof fujiRecipeSchema>;
export type FilmSimulation = (typeof FILM_SIMULATIONS)[number];

/** A stored recipe, or null for anything that isn't a valid Fujifilm recipe (including old food recipes). */
export function parseFujiRecipe(raw: unknown): FujiRecipe | null {
  const parsed = fujiRecipeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function formatSigned(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

function formatWhiteBalance(wb: NonNullable<FujiRecipe["whiteBalance"]>): string {
  const base = wb.mode === "Kelvin" ? `${wb.kelvin}K` : wb.mode;
  return `${base}, ${formatSigned(wb.red)} Red & ${formatSigned(wb.blue)} Blue`;
}

/** Label and value pairs in camera menu order, skipping settings that weren't given. */
export function recipeRows(recipe: FujiRecipe): { label: string; value: string }[] {
  const rows: { label: string; value: string | undefined }[] = [
    { label: "Film Simulation", value: recipe.filmSimulation },
    { label: "Dynamic Range", value: recipe.dynamicRange },
    { label: "Grain Effect", value: recipe.grain },
    { label: "Color Chrome Effect", value: recipe.colorChrome },
    { label: "Color Chrome FX Blue", value: recipe.colorChromeFxBlue },
    { label: "White Balance", value: recipe.whiteBalance ? formatWhiteBalance(recipe.whiteBalance) : undefined },
    ...(Object.keys(TONE_SETTINGS) as ToneKey[]).map((key) => ({
      label: TONE_SETTINGS[key].label,
      value: recipe[key] === undefined ? undefined : formatSigned(recipe[key]!),
    })),
    { label: "ISO", value: recipe.iso },
    { label: "Exposure Compensation", value: recipe.exposureCompensation },
  ];
  return rows.filter((r): r is { label: string; value: string } => r.value !== undefined);
}
