import React from "react";
import { Image as PdfImage, Text, View } from "./primitives";
import { placeCard } from "./recipe-card";
import { FillPhoto, cameraLine, coverPage, fitTitle, monthOf } from "./shared";
import type { PdfTemplateDefinition } from "./types";

/** Wide margins, like prints on a gallery wall (DIG-68). */
export const gallery: PdfTemplateDefinition = {
  Cover({ ctx }) {
    const { zine, faces, palette, u } = ctx;
    const cover = coverPage(zine);
    return (
      <View style={{ flexGrow: 1, alignItems: "center", paddingHorizontal: u(48), paddingTop: u(64), paddingBottom: u(30) }}>
        {cover ? <PdfImage src={cover.imageSrc} style={{ width: u(176), height: u(220), objectFit: cover.imageFit }} /> : null}
        <Text style={{ ...faces.heading, fontSize: fitTitle(zine.title, u(33), 46), lineHeight: 1.1, textAlign: "center", marginTop: u(26) }}>{zine.title}</Text>
        <View style={{ width: u(28), height: 1, backgroundColor: palette.accent, marginTop: u(12) }} />
        {zine.authorName ? (
          <Text style={{ ...faces.text, fontSize: u(9.5), letterSpacing: u(1.5), textTransform: "uppercase", color: palette.muted, marginTop: u(12) }}>{zine.authorName}</Text>
        ) : null}
        {zine.description ? (
          <Text style={{ ...faces.text, fontSize: u(9.5), lineHeight: 1.5, textAlign: "center", color: palette.muted, marginTop: u(14), maxLines: 4, textOverflow: "ellipsis" }}>
            {zine.description}
          </Text>
        ) : null}
        <Text style={{ ...faces.text, fontSize: u(8.5), letterSpacing: u(0.7), color: palette.muted, marginTop: "auto" }}>{monthOf(zine.publishedAt)}</Text>
      </View>
    );
  },

  PhotoPage({ ctx, page }) {
    const { settings, faces, palette, u } = ctx;
    const card = placeCard(ctx, page);
    const camera = cameraLine(page.exif ? { ...page.exif, focalLength: null } : null);
    return (
      <View style={{ flexGrow: 1, paddingHorizontal: u(44), paddingTop: u(44), paddingBottom: u(30) }}>
        <FillPhoto page={page}>{card.over}</FillPhoto>
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: u(18) }}>
          <View style={{ flexGrow: 1, flexBasis: 0 }}>
            {settings.pageNumbers ? (
              <Text style={{ ...faces.text, fontSize: u(8), letterSpacing: u(1.1), textTransform: "uppercase", color: palette.accent, marginBottom: u(4) }}>{`Plate ${page.pageNumber}`}</Text>
            ) : null}
            {page.name ? <Text style={{ ...faces.caption, fontSize: u(14), lineHeight: 1.2, marginBottom: u(4) }}>{page.name}</Text> : null}
            {settings.captions && page.caption ? <Text style={{ ...faces.text, fontSize: u(9), lineHeight: 1.5, marginBottom: u(4) }}>{page.caption}</Text> : null}
            {camera ? <Text style={{ ...faces.text, fontSize: u(8), color: palette.muted }}>{camera}</Text> : null}
          </View>
          {card.beside}
        </View>
        {card.under}
      </View>
    );
  },
};
