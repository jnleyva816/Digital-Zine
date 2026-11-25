import React from "react";
import { Image as PdfImage, Text, View } from "./primitives";
import { placeCard } from "./recipe-card";
import { FillPhoto, cameraLine, fitTitle, monthOf, twoDigits } from "./shared";
import type { PdfTemplateDefinition, TemplateContext } from "./types";

const small = ({ faces, palette, u }: TemplateContext) => ({
  ...faces.detail,
  fontSize: u(8),
  letterSpacing: u(1),
  textTransform: "uppercase" as const,
  color: palette.muted,
});

/** Full-bleed cover photo, thin photo margins (DIG-66). */
export const darkroom: PdfTemplateDefinition = {
  Cover({ ctx }) {
    const { zine, faces, palette, u, width, height } = ctx;
    const cover = zine.pages[0];
    return (
      <View style={{ flexGrow: 1 }}>
        {cover ? (
          <PdfImage src={cover.imageSrc} style={{ width, height: height * 0.663, objectFit: "cover" }} />
        ) : null}
        <View style={{ flexGrow: 1, paddingHorizontal: u(28), paddingTop: u(20), paddingBottom: u(24) }}>
          <Text style={{ ...faces.detail, fontSize: u(9), letterSpacing: u(1.8), textTransform: "uppercase", color: palette.accent }}>Folio</Text>
          <Text style={{ ...faces.heading, fontSize: fitTitle(zine.title, u(34), 34), lineHeight: 1.08, marginTop: u(8) }}>{zine.title}</Text>
          {zine.description ? (
            <Text style={{ ...faces.text, fontSize: u(10.5), lineHeight: 1.45, marginTop: u(8), color: palette.muted, maxLines: 4, textOverflow: "ellipsis" }}>
              {zine.description}
            </Text>
          ) : null}
          <View style={{ marginTop: "auto", paddingTop: u(8), flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={small(ctx)}>{zine.authorName ?? ""}</Text>
            <Text style={small(ctx)}>{monthOf(zine.publishedAt)}</Text>
          </View>
        </View>
      </View>
    );
  },

  PhotoPage({ ctx, page }) {
    const { zine, settings, faces, palette, u } = ctx;
    const card = placeCard(ctx, page);
    const caption = settings.captions ? page.caption : "";
    const camera = cameraLine(page.exif);
    const number = settings.pageNumbers ? `${twoDigits(page.pageNumber)} / ${twoDigits(zine.pages.length)}` : "";
    return (
      <View style={{ flexGrow: 1, paddingHorizontal: u(22), paddingTop: u(22), paddingBottom: u(20) }}>
        <FillPhoto page={page}>{card.over}</FillPhoto>
        {caption || card.beside ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: u(14) }}>
            <Text style={{ ...faces.caption, flexGrow: 1, flexBasis: 0, fontSize: u(12), lineHeight: 1.4 }}>{caption}</Text>
            {card.beside}
          </View>
        ) : null}
        {card.under}
        {camera || number ? (
          <View style={{ marginTop: u(14), flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={small(ctx)}>{camera}</Text>
            <Text style={small(ctx)}>{number}</Text>
          </View>
        ) : null}
      </View>
    );
  },
};
