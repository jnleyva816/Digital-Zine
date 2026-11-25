import React from "react";
import { Text, View } from "./primitives";
import { cardExif, cardLine, cardRows } from "@/lib/recipe-card";
import { edgeColor, twoDigits } from "./shared";
import type { PdfRenderedPageItem, TemplateContext } from "./types";

/** 12 pt in from the photo's edges. */
const INSET = 12;
/** A lab label is printed on white stock, whatever the page colour. */
const LABEL = { paper: "#FFFFFF", ink: "#1F2A30", muted: "#4A5A61" };

function Card({ ctx, page, wide }: { ctx: TemplateContext; page: PdfRenderedPageItem; wide: boolean }) {
  const { faces, palette, settings, u } = ctx;
  const { style, size, showName, showExif } = settings.card;
  const recipe = page.recipe!;
  const exif = showExif ? cardExif(page.exif) : "";
  const onLabel = style === "label";
  const ink = onLabel ? LABEL.ink : palette.text;
  const muted = onLabel ? LABEL.muted : style === "sticker" ? palette.text : palette.muted;
  const upper = style === "sticker" ? ("uppercase" as const) : undefined;
  const font = u(size === "full" ? 6.4 : 7);

  const rows = cardRows(recipe, size);
  const columns = size === "full" || (wide && rows.length > 3) ? [rows.filter((_, i) => i % 2 === 0), rows.filter((_, i) => i % 2 === 1)] : [rows];
  const list = (
    <View style={{ flexDirection: "row" }}>
      {columns.map((column, c) => (
        <View key={c} style={{ flexGrow: 1, flexBasis: 0, marginLeft: c ? u(9) : 0 }}>
          {column.map((row) => (
            <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: u(1.4) }}>
              <Text style={{ ...faces.detail, fontSize: font, color: muted, textTransform: upper }}>{row.label}</Text>
              <Text style={{ ...faces.detailStrong, fontSize: font, color: ink, textTransform: upper, flexShrink: 0, marginLeft: u(4) }}>{row.value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
  const name = (color: string, fontSize: number) =>
    showName ? (
      <Text style={{ ...faces.heading, fontSize, lineHeight: 1.15, color, textTransform: upper, marginBottom: u(3), maxLines: 2, textOverflow: "ellipsis" }}>{recipe.name}</Text>
    ) : null;
  const foot = exif ? <Text style={{ ...faces.detail, fontSize: font, color: muted, marginTop: u(4) }}>{exif}</Text> : null;

  if (style === "line") {
    return (
      <View style={{ backgroundColor: palette.page, paddingVertical: u(3) }}>
        <Text style={{ ...faces.detail, fontSize: u(7.5), color: palette.text, maxLines: 1, textOverflow: "ellipsis" }}>{cardLine(recipe, size, showName)}</Text>
        {foot}
      </View>
    );
  }
  if (style === "label") {
    return (
      <View style={{ backgroundColor: LABEL.paper, borderWidth: 1, borderColor: LABEL.ink }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: LABEL.ink, paddingVertical: u(4), paddingHorizontal: u(8) }}>
          <Text style={{ ...faces.detail, fontSize: u(6.5), letterSpacing: u(0.8), color: LABEL.paper }}>{`RECIPE · ${twoDigits(page.pageNumber)}A`}</Text>
          <View style={{ width: u(4), height: u(4), borderRadius: u(2), backgroundColor: edgeColor(ctx) }} />
        </View>
        <View style={{ paddingHorizontal: u(8), paddingTop: u(5), paddingBottom: u(7) }}>
          {name(LABEL.ink, u(12))}
          {list}
          {foot}
        </View>
      </View>
    );
  }
  if (style === "wall") {
    return (
      <View style={{ backgroundColor: palette.page, borderTopWidth: 1, borderTopColor: palette.text, paddingTop: u(6) }}>
        {name(palette.text, u(13))}
        {list}
        {foot}
      </View>
    );
  }
  if (style === "sticker") {
    return (
      <View style={{ transform: "rotate(3deg)", paddingRight: u(3), paddingBottom: u(3) }}>
        <View style={{ position: "absolute", top: u(3), left: u(3), right: 0, bottom: 0, backgroundColor: palette.text }} />
        <View style={{ backgroundColor: palette.page, borderWidth: u(2), borderColor: palette.accent, paddingHorizontal: u(9), paddingTop: u(7), paddingBottom: u(8) }}>
          {name(palette.accent, u(15))}
          {list}
          {foot}
        </View>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: palette.page, borderWidth: 1, borderColor: palette.muted, borderRadius: u(4), paddingHorizontal: u(9), paddingVertical: u(8) }}>
      {name(palette.text, u(12))}
      {list}
      {foot}
    </View>
  );
}

export interface PlacedCard {
  over: React.ReactElement | null;
  beside: React.ReactElement | null;
  under: React.ReactElement | null;
}

/**
 * The page's recipe card, wherever the creator put it (DIG-70). A template draws all three; at most
 * one is there. A single line needs the page's width, so beside the caption it goes under it.
 */
export function placeCard(ctx: TemplateContext, page: PdfRenderedPageItem): PlacedCard {
  const none: PlacedCard = { over: null, beside: null, under: null };
  const { settings, u } = ctx;
  if (!settings.recipeCards || !page.recipe) return none;
  const { location, size, style } = settings.card;
  const width = u(size === "full" ? 246 : 164);

  if (location.startsWith("over-")) {
    const corner = {
      ...(location[5] === "t" ? { top: INSET } : { bottom: INSET }),
      ...(location[6] === "l" ? { left: INSET } : { right: INSET }),
    };
    const box = style === "line" ? { left: INSET, right: INSET, ...(location[5] === "t" ? { top: INSET } : { bottom: INSET }) } : { width, ...corner };
    const padded = style === "line" || style === "wall" ? { backgroundColor: ctx.palette.page, padding: u(7) } : {};
    return {
      ...none,
      over: (
        <View style={{ position: "absolute", ...box, ...padded }}>
          <Card ctx={ctx} page={page} wide={false} />
        </View>
      ),
    };
  }
  if (location === "beside-caption" && style !== "line") {
    return {
      ...none,
      beside: (
        <View style={{ width, flexShrink: 0, marginLeft: u(14) }}>
          <Card ctx={ctx} page={page} wide={false} />
        </View>
      ),
    };
  }
  return {
    ...none,
    under: (
      <View style={{ marginTop: u(10) }}>
        <Card ctx={ctx} page={page} wide />
      </View>
    ),
  };
}
