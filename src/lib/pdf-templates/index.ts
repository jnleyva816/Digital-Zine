import type { PdfTemplate } from "@/lib/pdf-settings";
import { contact } from "./contact";
import { darkroom } from "./darkroom";
import { gallery } from "./gallery";
import { riso } from "./riso";
import type { PdfTemplateDefinition } from "./types";

export const PDF_TEMPLATES: Record<PdfTemplate, PdfTemplateDefinition> = {
  darkroom,
  contact,
  gallery,
  riso,
};
