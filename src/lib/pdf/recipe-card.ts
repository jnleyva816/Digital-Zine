import { formatSigned, type FujiRecipe } from "@/lib/fuji/fuji-recipe";
import type { RecipeCardSize } from "@/lib/pdf/pdf-settings";
import type { ExifData } from "@/lib/zine/types";

/** A recipe card's lines (DIG-70), with labels short enough to stay on one line. Shared by the PDF and the editor's preview. */
export interface CardRow {
  label: string;
  value: string;
}

function shortWhiteBalance(wb: NonNullable<FujiRecipe["whiteBalance"]>): string {
  const mode = wb.mode === "Kelvin" ? `${wb.kelvin}K` : wb.mode.replace(/^Auto \((\w+) Priority\)$/, "Auto $1");
  return `${mode} R${formatSigned(wb.red)} B${formatSigned(wb.blue)}`;
}

const signed = (n: number | undefined) => (n === undefined ? undefined : formatSigned(n));

const ROWS: { label: string; sizes: RecipeCardSize[]; value: (r: FujiRecipe) => string | undefined }[] = [
  { label: "Film", sizes: ["compact", "standard", "full"], value: (r) => r.filmSimulation },
  { label: "DR", sizes: ["compact", "standard", "full"], value: (r) => r.dynamicRange },
  { label: "WB", sizes: ["compact", "standard", "full"], value: (r) => (r.whiteBalance ? shortWhiteBalance(r.whiteBalance) : undefined) },
  { label: "Grain", sizes: ["standard", "full"], value: (r) => r.grain },
  { label: "Color", sizes: ["standard", "full"], value: (r) => signed(r.color) },
  { label: "Clarity", sizes: ["standard", "full"], value: (r) => signed(r.clarity) },
  { label: "Chrome", sizes: ["full"], value: (r) => r.colorChrome },
  { label: "FX Blue", sizes: ["full"], value: (r) => r.colorChromeFxBlue },
  { label: "High", sizes: ["full"], value: (r) => signed(r.highlight) },
  { label: "Shadow", sizes: ["full"], value: (r) => signed(r.shadow) },
  { label: "Sharp", sizes: ["full"], value: (r) => signed(r.sharpness) },
  { label: "NR", sizes: ["full"], value: (r) => signed(r.noiseReduction) },
  { label: "ISO", sizes: ["full"], value: (r) => r.iso?.replace(/^Auto up to ISO /, "Auto ").replace(/^ISO /, "") },
  { label: "EV", sizes: ["full"], value: (r) => r.exposureCompensation },
];

export function cardRows(recipe: FujiRecipe, size: RecipeCardSize): CardRow[] {
  return ROWS.flatMap(({ label, sizes, value }) => {
    const v = sizes.includes(size) ? value(recipe) : undefined;
    return v === undefined ? [] : [{ label, value: v }];
  });
}

/** The one-line style: the name, then the settings. */
export function cardLine(recipe: FujiRecipe, size: RecipeCardSize, showName: boolean): string {
  return [showName ? recipe.name : null, ...cardRows(recipe, size).map((r) => r.value)].filter(Boolean).join(" · ");
}

/** The optional foot of a card: f-stop, shutter, ISO. */
export function cardExif(exif: ExifData | null): string {
  return [exif?.aperture, exif?.shutterSpeed, exif?.iso ? `ISO ${exif.iso}` : null].filter(Boolean).join(" · ");
}
