import type { ReactElement } from "react";
import type { PdfPalette, PdfSettings } from "@/lib/pdf/pdf-settings";
import type { TypefaceFaces } from "@/lib/pdf/pdf-typefaces";
import type { ExifData, RecipeData } from "@/lib/zine/types";

export interface PdfRenderedPageItem {
  pageNumber: number;
  /** The creator's name for the photo (DIG-34), never the camera's file name. */
  name: string | null;
  caption: string;
  /** JPEG bytes, already read from storage. Pages without an image are left out before rendering. */
  imageSrc: { data: Buffer; format: "jpg" };
  /** "contain" for an edited photo, which arrives cropped and framed (DIG-33). */
  imageFit: "cover" | "contain";
  /** Both null on a page whose card does not flip: it has no back. */
  exif: ExifData | null;
  recipe: RecipeData | null;
}

export interface PdfZinePayload {
  title: string;
  description: string | null;
  /** The creator's display name, or null to leave the byline out. Never an email address. */
  authorName: string | null;
  /** ISO date. */
  publishedAt: string;
  pages: PdfRenderedPageItem[];
  /** The photo chosen for the cover, when it is not the first (DIG-126). It need not be one of `pages`. */
  coverPhoto?: PdfRenderedPageItem | null;
  settings: PdfSettings;
}

/** Everything a template draws with, resolved from the zine's settings (DIG-66). */
export interface TemplateContext {
  zine: PdfZinePayload;
  settings: PdfSettings;
  faces: TypefaceFaces;
  palette: PdfPalette;
  /** The page in points. */
  width: number;
  height: number;
  /** Points for a length on the design canvas, whose pages are 397 px wide. */
  u: (px: number) => number;
}

/** A template draws what is inside a page; the document owns the pages themselves. */
export interface PdfTemplateDefinition {
  Cover: (props: { ctx: TemplateContext }) => ReactElement;
  PhotoPage: (props: { ctx: TemplateContext; page: PdfRenderedPageItem }) => ReactElement;
}
