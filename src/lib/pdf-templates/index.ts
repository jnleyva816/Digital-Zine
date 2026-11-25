import type { PdfTemplate } from "@/lib/pdf-settings";
import { darkroom } from "./darkroom";
import type { PdfTemplateDefinition } from "./types";

/** The other three arrive with their own tickets (DIG-67, DIG-68, DIG-69). */
export const PDF_TEMPLATES: Record<PdfTemplate, PdfTemplateDefinition> = {
  darkroom,
  contact: darkroom,
  gallery: darkroom,
  riso: darkroom,
};
