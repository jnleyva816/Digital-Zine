import React from "react";
import { Image as PdfImage, View } from "./primitives";
import type { ExifData } from "@/lib/zine/types";
import { TEMPLATES } from "@/lib/pdf/pdf-settings";
import type { PdfRenderedPageItem, PdfZinePayload, TemplateContext } from "./types";

/** "X-T5 · 33mm · f/2.8 · 1/250s · ISO 400", with whatever is missing left out. */
export function cameraLine(exif: ExifData | null, separator = " · "): string {
  if (!exif) return "";
  return [exif.cameraModel, exif.focalLength, exif.aperture, exif.shutterSpeed, exif.iso ? `ISO ${exif.iso}` : null]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(separator);
}

/** The cover's photo: the one chosen, or the first (DIG-126). */
export const coverPage = (zine: PdfZinePayload): PdfRenderedPageItem | undefined => zine.coverPhoto ?? zine.pages[0];

/** Contact Sheet's edge print: amber, until the creator picks another palette. Then, and elsewhere, the accent. */
export const edgeColor = ({ settings, palette }: TemplateContext) =>
  settings.template === "contact" && settings.palette === TEMPLATES.contact.palette ? "#E8A33D" : palette.accent;

export const twoDigits = (n: number) => String(n).padStart(2, "0");

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
export const monthOf = (iso: string) => MONTH.format(new Date(iso));

/** A heading size that leaves a long title room: full size up to `comfortable` characters, smaller after. */
export function fitTitle(title: string, size: number, comfortable: number): number {
  return title.length <= comfortable ? size : Math.max(size * 0.42, size * Math.sqrt(comfortable / title.length));
}

/**
 * The photo fills whatever the rest of the page leaves (`flexGrow`), so a long caption or a large
 * card shrinks the photo instead of running off the page.
 */
export function FillPhoto({ page, children }: { page: PdfRenderedPageItem; children?: React.ReactNode }) {
  return (
    <View style={{ position: "relative", flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 120, overflow: "hidden" }}>
      <PdfImage src={page.imageSrc} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: page.imageFit }} />
      {children}
    </View>
  );
}
