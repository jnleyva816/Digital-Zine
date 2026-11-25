import { MINI_PHOTO_LIMIT, PALETTES, type PdfPalette, type PdfSettings } from "@/lib/pdf-settings";

/**
 * What goes on the mini zine's eight panels (DIG-73). Client-safe, so the editor's reading-order strip can
 * share it.
 */

/** Fewer photos would leave blank pages (owner, 25 Nov 2026). */
export const MINI_PHOTO_MINIMUM = 4;

/** Dark pages become Paper with ink saver on. */
export function miniPalette({ palette, inkSaver }: Pick<PdfSettings, "palette" | "inkSaver">): PdfPalette {
  return PALETTES[inkSaver && palette === "ink" ? "paper" : palette];
}

/** The zine's pages the mini zine prints: the creator's choice in its order, or the first six. */
export function pickMiniPages<T>(pages: T[], assetIdOf: (page: T) => string, chosen: string[]): T[] {
  const picked = chosen.flatMap((id) => pages.find((p) => assetIdOf(p) === id) ?? []);
  return (picked.length ? picked : pages).slice(0, MINI_PHOTO_LIMIT);
}

export type MiniInnerPage<T> = { kind: "photo"; photo: T } | { kind: "intro" | "recipes" | "blank" };

/** Pages 2 to 7 in reading order. A single spare page goes to the recipes (owner, 25 Nov 2026). */
export function miniInnerPages<T>(photos: T[], hasRecipePage: boolean): MiniInnerPage<T>[] {
  const pages: MiniInnerPage<T>[] = photos.slice(0, MINI_PHOTO_LIMIT).map((photo) => ({ kind: "photo", photo }));
  if (hasRecipePage && pages.length < MINI_PHOTO_LIMIT) pages.push({ kind: "recipes" });
  if (pages.length < MINI_PHOTO_LIMIT) pages.unshift({ kind: "intro" });
  while (pages.length < MINI_PHOTO_LIMIT) pages.push({ kind: "blank" });
  return pages;
}
