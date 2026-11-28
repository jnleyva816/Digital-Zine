import type { PdfTypeface } from "@/lib/pdf/pdf-settings";

/** One face of a font family, in the shape both react-pdf styles and CSS use. */
export interface FontFace {
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
}

export interface TypefaceFaces {
  heading: FontFace;
  /** Captions: the heading family's italic where it has one. */
  caption: FontFace;
  text: FontFace;
  textStrong: FontFace;
  detail: FontFace;
  detailStrong: FontFace;
}

const face = (fontFamily: string, fontWeight = 400, fontStyle: FontFace["fontStyle"] = "normal"): FontFace => ({ fontFamily, fontWeight, fontStyle });

/** The five pairs (owner, 19 Nov 2026), for the PDF and the editor's preview alike (DIG-65). */
export const TYPEFACE_FACES: Record<PdfTypeface, TypefaceFaces> = {
  editorial: {
    heading: face("Fraunces", 600),
    caption: face("Fraunces", 400, "italic"),
    text: face("Inter"),
    textStrong: face("Inter", 500),
    detail: face("IBM Plex Mono"),
    detailStrong: face("IBM Plex Mono", 500),
  },
  gallery: {
    heading: face("Instrument Serif"),
    caption: face("Instrument Serif", 400, "italic"),
    text: face("Inter"),
    textStrong: face("Inter", 500),
    detail: face("DM Mono"),
    detailStrong: face("DM Mono"),
  },
  technical: {
    heading: face("Space Grotesk", 700),
    caption: face("Space Grotesk"),
    text: face("Space Grotesk"),
    textStrong: face("Space Grotesk", 700),
    detail: face("DM Mono"),
    detailStrong: face("DM Mono"),
  },
  typewriter: {
    heading: face("Courier Prime", 700),
    caption: face("Courier Prime"),
    text: face("Courier Prime"),
    textStrong: face("Courier Prime", 700),
    detail: face("Courier Prime"),
    detailStrong: face("Courier Prime", 700),
  },
  poster: {
    heading: face("Anton"),
    caption: face("Space Grotesk"),
    text: face("Space Grotesk"),
    textStrong: face("Space Grotesk", 700),
    detail: face("Courier Prime"),
    detailStrong: face("Courier Prime", 700),
  },
};
