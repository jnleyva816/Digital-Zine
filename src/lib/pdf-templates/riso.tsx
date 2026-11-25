import React from "react";
import { Image as PdfImage, Text, View } from "./primitives";
import { placeCard } from "./recipe-card";
import { FillPhoto, cameraLine, coverPage, fitTitle, monthOf, twoDigits } from "./shared";
import type { PdfTemplateDefinition } from "./types";

/**
 * Two inks, slightly off register (DIG-69): the palette's text colour is ink 1 and its accent ink 2.
 * The photos arrive already duotoned, because a PDF cannot blend them.
 */
export const riso: PdfTemplateDefinition = {
  Cover({ ctx }) {
    const { zine, faces, palette, u, width, height } = ctx;
    const cover = coverPage(zine);
    const title = { ...faces.heading, fontSize: fitTitle(zine.title, u(64), 24), lineHeight: 1, textTransform: "uppercase" as const };
    const label = { ...faces.detailStrong, fontSize: u(10), textTransform: "uppercase" as const };
    const pages = `${zine.pages.length} ${zine.pages.length === 1 ? "page" : "pages"}`;
    return (
      <View style={{ width, height }}>
        {cover ? (
          <PdfImage src={cover.imageSrc} style={{ position: "absolute", left: 0, top: height * 0.467, width, height: height * 0.533, objectFit: "cover" }} />
        ) : null}
        <Text style={{ ...title, position: "absolute", top: u(23), left: u(24), right: u(16), color: palette.accent }}>{zine.title}</Text>
        <Text style={{ ...title, position: "absolute", top: u(20), left: u(20), right: u(20), color: palette.text }}>{zine.title}</Text>
        <Text style={{ ...label, position: "absolute", left: u(20), right: u(120), top: height * 0.467 - u(22), color: palette.text, maxLines: 1, textOverflow: "ellipsis" }}>
          {[zine.authorName, monthOf(zine.publishedAt)].filter(Boolean).join(" · ")}
        </Text>
        <View
          style={{
            position: "absolute", right: u(22), top: height * 0.467 - u(39), width: u(78), height: u(78), borderRadius: u(39),
            backgroundColor: palette.accent, alignItems: "center", justifyContent: "center", transform: "rotate(-12deg)",
          }}
        >
          <Text style={{ ...label, color: palette.page, textAlign: "center" }}>{pages}</Text>
        </View>
      </View>
    );
  },

  PhotoPage({ ctx, page }) {
    const { settings, faces, palette, u } = ctx;
    const card = placeCard(ctx, page);
    const camera = cameraLine(page.exif, " / ");
    const caption = settings.captions ? page.caption : "";
    return (
      <View style={{ flexGrow: 1, paddingHorizontal: u(18), paddingTop: u(18), paddingBottom: u(16) }}>
        <FillPhoto page={page}>{card.over}</FillPhoto>
        {caption || card.beside ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: u(14) }}>
            <Text style={{ ...faces.detail, flexGrow: 1, flexBasis: 0, fontSize: u(11), lineHeight: 1.4 }}>{caption}</Text>
            {card.beside}
          </View>
        ) : null}
        {card.under}
        {camera || settings.pageNumbers ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", minHeight: settings.pageNumbers ? u(72) : u(20) }}>
            <Text style={{ ...faces.detailStrong, fontSize: u(9), textTransform: "uppercase" }}>{camera}</Text>
            {settings.pageNumbers ? (
              <Text style={{ ...faces.heading, fontSize: u(68), lineHeight: 1, color: palette.accent }}>{twoDigits(page.pageNumber)}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  },
};
