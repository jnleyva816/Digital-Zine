import { z } from "zod";
import "@/lib/zod-setup";

/**
 * How a zine's PDF looks (DIG-64): the one definition the API, the PDF, and the editor share.
 * Client-safe: no Node imports.
 */

export interface PdfPalette {
  label: string;
  page: string;
  text: string;
  muted: string;
  accent: string;
}

/** Owner, 19 Nov 2026. On Riso, `text` is ink 1 and `accent` is ink 2. */
export const PALETTES = {
  ink: { label: "Ink", page: "#161412", text: "#FDFBF7", muted: "#B8AFA4", accent: "#E8693F" },
  paper: { label: "Paper", page: "#FDFBF7", text: "#161412", muted: "#5E564D", accent: "#B83D1B" },
  fog: { label: "Fog", page: "#E4E8E2", text: "#1F2A30", muted: "#4A5A61", accent: "#2F5D73" },
  kodachrome: { label: "Kodachrome", page: "#F3E9D8", text: "#2B1810", muted: "#6B4E3A", accent: "#B32E17" },
  riso: { label: "Riso", page: "#F2EDE4", text: "#0058A3", muted: "#2E4E7A", accent: "#FF48B0" },
} as const satisfies Record<string, PdfPalette>;

export const TYPEFACES = {
  editorial: { label: "Editorial", pair: "Fraunces headings · Inter text · Plex Mono details" },
  gallery: { label: "Gallery", pair: "Instrument Serif headings · Inter text · DM Mono details" },
  technical: { label: "Technical", pair: "Space Grotesk headings and text · DM Mono details" },
  typewriter: { label: "Typewriter", pair: "Courier Prime throughout" },
  poster: { label: "Poster", pair: "Anton headings · Space Grotesk text · Courier Prime details" },
} as const;

export const CARD_STYLES = { outline: "Outline", label: "Lab label", wall: "Wall label", sticker: "Sticker", line: "One line" } as const;
export const RECIPE_CARD_SIZES = { compact: "Compact", standard: "Standard", full: "Full" } as const;
export const CARD_LOCATIONS = {
  "over-tl": "On photo, top left",
  "over-tr": "On photo, top right",
  "over-br": "On photo, bottom right",
  "over-bl": "On photo, bottom left",
  "beside-caption": "Beside the caption",
  "under-caption": "Under the caption",
} as const;
/** What the cover shows (owner, 25 Nov 2026; DIG-126). */
export const COVERS = { title: "Title only", template: "Template cover", full: "Full-page photo", grid: "Photo grid" } as const;
export const PAPERS = {
  letter: { label: "Letter", hint: "US and Canada" },
  a4: { label: "A4", hint: "Most other countries" },
} as const;

export const TEMPLATES = {
  darkroom: { label: "Darkroom", description: "Dark pages, a full-bleed cover, thin photo margins.", typeface: "editorial", palette: "ink", style: "outline", location: "beside-caption" },
  contact: { label: "Contact Sheet", description: "Photos in film frames with sprocket holes and edge print.", typeface: "technical", palette: "fog", style: "label", location: "beside-caption" },
  gallery: { label: "Gallery", description: "Light pages and wide margins, like prints on a wall.", typeface: "gallery", palette: "paper", style: "wall", location: "beside-caption" },
  riso: { label: "Riso", description: "Two-ink duotone photos and huge type, slightly off-register.", typeface: "poster", palette: "riso", style: "sticker", location: "over-br" },
} as const;

export type PdfTemplate = keyof typeof TEMPLATES;
export type PdfTypeface = keyof typeof TYPEFACES;
export type PdfPaletteName = keyof typeof PALETTES;
export type PdfPaper = keyof typeof PAPERS;
export type CoverStyle = keyof typeof COVERS;
export type CardStyle = keyof typeof CARD_STYLES;
export type RecipeCardSize = keyof typeof RECIPE_CARD_SIZES;
export type CardLocation = keyof typeof CARD_LOCATIONS;

/** Cover, back, and six photos make the eight panels of one sheet. */
export const MINI_PHOTO_LIMIT = 6;

const keys = <T extends Record<string, unknown>>(table: T) => z.enum(Object.keys(table) as [keyof T & string, ...(keyof T & string)[]]);

export const pdfSettingsSchema = z
  .object({
    format: z.enum(["booklet", "mini"]),
    template: keys(TEMPLATES),
    typeface: keys(TYPEFACES),
    palette: keys(PALETTES),
    paper: keys(PAPERS),
    captions: z.boolean(),
    pageNumbers: z.boolean(),
    recipeCards: z.boolean(),
    card: z
      .object({
        style: keys(CARD_STYLES),
        size: keys(RECIPE_CARD_SIZES),
        location: keys(CARD_LOCATIONS),
        showName: z.boolean(),
        showExif: z.boolean(),
      })
      .strict(),
    /** A style saved before covers could be chosen keeps its template's photo cover (DIG-126). */
    cover: z
      .object({ style: keys(COVERS), photo: z.string().min(1).max(64).nullable() })
      .strict()
      .default({ style: "template", photo: null }),
    guides: z.boolean(),
    inkSaver: z.boolean(),
    recipePage: z.boolean(),
    miniPhotos: z
      .array(z.string().min(1).max(64))
      .max(MINI_PHOTO_LIMIT, `The mini zine holds ${MINI_PHOTO_LIMIT} photos.`)
      .refine((ids) => new Set(ids).size === ids.length, "Each photo can be in the mini zine once."),
  })
  .strict();

export type PdfSettings = z.infer<typeof pdfSettingsSchema>;

/** Stored settings, or null when the creator has not picked a style yet: none is ever guessed. */
export function parsePdfSettings(value: unknown): PdfSettings | null {
  const parsed = pdfSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function look(template: PdfTemplate) {
  const { typeface, palette, style, location } = TEMPLATES[template];
  return { template, typeface, palette, card: { style, location } };
}

export function defaultPdfSettings(template: PdfTemplate, paper: PdfPaper): PdfSettings {
  const { card, ...rest } = look(template);
  return {
    format: "booklet",
    ...rest,
    paper,
    captions: true,
    pageNumbers: true,
    recipeCards: true,
    card: { ...card, size: "standard", showName: true, showExif: false },
    cover: { style: "title", photo: null },
    guides: true,
    inkSaver: false,
    recipePage: true,
    miniPhotos: [],
  };
}

/** The same settings in another template's look. Everything the template does not set is kept. */
export function withTemplate(settings: PdfSettings, template: PdfTemplate): PdfSettings {
  const { card, ...rest } = look(template);
  return { ...settings, ...rest, card: { ...settings.card, ...card } };
}
