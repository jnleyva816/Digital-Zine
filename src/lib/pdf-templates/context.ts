import { PALETTES, type PdfPaper, type PdfSettings } from "@/lib/pdf-settings";
import { TYPEFACE_FACES } from "@/lib/pdf-typefaces";
import type { PdfZinePayload, TemplateContext } from "./types";

/** Page sizes in points. */
export const PAPER_POINTS: Record<PdfPaper, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

/** The design canvas draws its pages 397 px wide. */
const CANVAS_WIDTH = 397;

/** What a template draws with, for the PDF and the editor's preview alike. Client-safe. */
export function templateContext(zine: PdfZinePayload, settings: PdfSettings = zine.settings): TemplateContext {
  const size = PAPER_POINTS[settings.paper];
  return {
    zine,
    settings,
    faces: TYPEFACE_FACES[settings.typeface],
    palette: PALETTES[settings.palette],
    ...size,
    u: (px) => (px * size.width) / CANVAS_WIDTH,
  };
}
