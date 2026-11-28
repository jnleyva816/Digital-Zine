import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * The fonts the PDF prints in (DIG-65), read from `assets/fonts` and never fetched. Each family's
 * folder holds its OFL licence. Fraunces, Inter, and Space Grotesk are static cuts of the variable
 * fonts in google/fonts, because react-pdf cannot use variable ones.
 */
export const FONT_ROOT = path.join(process.cwd(), "assets", "fonts");

export const FONT_FILES = [
  { family: "Fraunces", file: "fraunces/Fraunces-SemiBold.ttf", fontWeight: 600, fontStyle: "normal" },
  { family: "Fraunces", file: "fraunces/Fraunces-Italic.ttf", fontWeight: 400, fontStyle: "italic" },
  { family: "Inter", file: "inter/Inter-Regular.ttf", fontWeight: 400, fontStyle: "normal" },
  { family: "Inter", file: "inter/Inter-Medium.ttf", fontWeight: 500, fontStyle: "normal" },
  { family: "IBM Plex Mono", file: "ibmplexmono/IBMPlexMono-Regular.ttf", fontWeight: 400, fontStyle: "normal" },
  { family: "IBM Plex Mono", file: "ibmplexmono/IBMPlexMono-Medium.ttf", fontWeight: 500, fontStyle: "normal" },
  { family: "Instrument Serif", file: "instrumentserif/InstrumentSerif-Regular.ttf", fontWeight: 400, fontStyle: "normal" },
  { family: "Instrument Serif", file: "instrumentserif/InstrumentSerif-Italic.ttf", fontWeight: 400, fontStyle: "italic" },
  { family: "DM Mono", file: "dmmono/DMMono-Regular.ttf", fontWeight: 400, fontStyle: "normal" },
  { family: "Space Grotesk", file: "spacegrotesk/SpaceGrotesk-Regular.ttf", fontWeight: 400, fontStyle: "normal" },
  { family: "Space Grotesk", file: "spacegrotesk/SpaceGrotesk-Bold.ttf", fontWeight: 700, fontStyle: "normal" },
  { family: "Courier Prime", file: "courierprime/CourierPrime-Regular.ttf", fontWeight: 400, fontStyle: "normal" },
  { family: "Courier Prime", file: "courierprime/CourierPrime-Bold.ttf", fontWeight: 700, fontStyle: "normal" },
  { family: "Anton", file: "anton/Anton-Regular.ttf", fontWeight: 400, fontStyle: "normal" },
] as const;

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  registered = true;
  for (const { family, file, fontWeight, fontStyle } of FONT_FILES) {
    Font.register({ family, src: path.join(FONT_ROOT, file), fontWeight, fontStyle });
  }
  // Words are never broken: a title must not split mid-word.
  Font.registerHyphenationCallback((word) => [word]);
}
