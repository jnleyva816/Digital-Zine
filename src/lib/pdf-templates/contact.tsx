import React from "react";
import { Image as PdfImage, Polygon, Rect, Svg, Text, View } from "./primitives";
import { placeCard } from "./recipe-card";
import { FillPhoto, cameraLine, edgeColor, fitTitle, monthOf, twoDigits } from "./shared";
import type { PdfTemplateDefinition, TemplateContext } from "./types";

const FILM = "#111111";

/** Vector holes in the page's own colour, so they stay sharp in print. */
function Sprockets({ ctx, width }: { ctx: TemplateContext; width: number }) {
  const { u, palette } = ctx;
  const pitch = u(13);
  const count = Math.floor(width / pitch);
  const start = (width - count * pitch) / 2 + (pitch - u(5)) / 2;
  return (
    <Svg width={width} height={u(10)} viewBox={`0 0 ${width} ${u(10)}`}>
      {Array.from({ length: count }, (_, i) => (
        <Rect key={i} x={start + i * pitch} y={u(3)} width={u(5)} height={u(4)} rx={u(1)} ry={u(1)} fill={palette.page} />
      ))}
    </Svg>
  );
}

/** No bundled font has "▸", so it is drawn. */
function Frame({ ctx, label }: { ctx: TemplateContext; label: string }) {
  const { u } = ctx;
  const color = edgeColor(ctx);
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Svg width={u(4)} height={u(5)} viewBox="0 0 4 5">
        <Polygon points="0,0 4,2.5 0,5" fill={color} />
      </Svg>
      <Text style={{ ...edgeText(ctx), marginLeft: u(3) }}>{label}</Text>
    </View>
  );
}

const edgeText = (ctx: TemplateContext) => ({ ...ctx.faces.detail, fontSize: ctx.u(7.5), letterSpacing: ctx.u(1), color: edgeColor(ctx) });
const detail = ({ faces, palette, u }: TemplateContext) => ({ ...faces.detail, fontSize: u(8), color: palette.muted });

/** Photos in film frames with sprocket holes and edge print (DIG-67). */
export const contact: PdfTemplateDefinition = {
  Cover({ ctx }) {
    const { zine, faces, palette, u, width } = ctx;
    const strip = width - u(52);
    const frames = zine.pages.slice(0, 4);
    const line = { ...faces.detail, fontSize: u(8.5), letterSpacing: u(1.1), textTransform: "uppercase" as const, color: palette.muted };
    const cell = (strip - u(22)) / (frames.length === 1 ? 1 : 2);
    return (
      <View style={{ flexGrow: 1, paddingHorizontal: u(26), paddingTop: u(28), paddingBottom: u(22) }}>
        <Text style={line}>{`${zine.pages.length} ${zine.pages.length === 1 ? "frame" : "frames"}`}</Text>
        <View style={{ backgroundColor: FILM, marginTop: u(14), paddingHorizontal: u(8) }}>
          <View style={{ marginHorizontal: -u(8) }}>
            <Sprockets ctx={ctx} width={strip} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingTop: u(3) }}>
            {frames.map((page) => (
              <View key={page.pageNumber} style={{ width: cell, height: u(frames.length > 2 ? 132 : 230), marginBottom: u(6), overflow: "hidden" }}>
                <PdfImage src={page.imageSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingBottom: u(5) }}>
            {frames.map((page) => (
              <Frame key={page.pageNumber} ctx={ctx} label={`${twoDigits(page.pageNumber)}A`} />
            ))}
          </View>
        </View>
        <Text style={{ ...faces.heading, fontSize: fitTitle(zine.title, u(31), 46), lineHeight: 1.06, marginTop: u(16) }}>{zine.title}</Text>
        {zine.description ? (
          <Text style={{ ...faces.text, fontSize: u(10.5), lineHeight: 1.45, marginTop: u(8), color: palette.muted, maxLines: 4, textOverflow: "ellipsis" }}>{zine.description}</Text>
        ) : null}
        <View style={{ marginTop: "auto", flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={line}>{zine.authorName ?? ""}</Text>
          <Text style={line}>{monthOf(zine.publishedAt)}</Text>
        </View>
      </View>
    );
  },

  PhotoPage({ ctx, page }) {
    const { zine, settings, faces, u, width } = ctx;
    const card = placeCard(ctx, page);
    const camera = cameraLine(page.exif ? { ...page.exif, cameraModel: null } : null);
    const number = settings.pageNumbers ? `${twoDigits(page.pageNumber)} / ${twoDigits(zine.pages.length)}` : "";
    const caption = settings.captions ? page.caption : "";
    return (
      <View style={{ flexGrow: 1, paddingTop: u(26), paddingBottom: u(20) }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, backgroundColor: FILM }}>
          <Sprockets ctx={ctx} width={width} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: u(14), paddingBottom: u(4) }}>
            <Text style={edgeText(ctx)}>{page.exif?.cameraModel?.trim() ?? ""}</Text>
            <Frame ctx={ctx} label={`${twoDigits(page.pageNumber)}A`} />
            <Text style={edgeText(ctx)}>{page.recipe ? page.recipe.filmSimulation.toUpperCase() : "NO RECIPE"}</Text>
          </View>
          <FillPhoto page={page}>{card.over}</FillPhoto>
          <Sprockets ctx={ctx} width={width} />
        </View>
        <View style={{ paddingHorizontal: u(26) }}>
          {caption || camera || card.beside ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: u(14) }}>
              <View style={{ flexGrow: 1, flexBasis: 0 }}>
                {caption ? <Text style={{ ...faces.text, fontSize: u(11), lineHeight: 1.45, marginBottom: u(6) }}>{caption}</Text> : null}
                {camera ? <Text style={detail(ctx)}>{camera}</Text> : null}
              </View>
              {card.beside}
            </View>
          ) : null}
          {card.under}
          {number ? <Text style={{ ...detail(ctx), textAlign: "right", marginTop: u(10) }}>{number}</Text> : null}
        </View>
      </View>
    );
  },
};
