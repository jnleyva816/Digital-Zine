import React from "react";
import { Image as PdfImage, Text, View } from "./primitives";
import { PDF_TEMPLATES } from ".";
import { coverPage, fitTitle, monthOf } from "./shared";
import type { PdfRenderedPageItem, TemplateContext } from "./types";

/** The covers that are the same in every template but for its type, colours, and manner (DIG-126). */

const FILM = "#111111";
const centred = ({ settings }: TemplateContext) => settings.template === "gallery";
const textAlign = (ctx: TemplateContext) => (centred(ctx) ? ("center" as const) : ("left" as const));

/** On Riso the title prints in both inks, slightly off register. */
function Title({ ctx, size, comfortable, maxLines }: { ctx: TemplateContext; size: number; comfortable: number; maxLines: number }) {
  const { zine, settings, faces, palette, u } = ctx;
  const riso = settings.template === "riso";
  const style = {
    ...faces.heading,
    fontSize: fitTitle(zine.title, u(size), comfortable),
    lineHeight: 1.1,
    textAlign: textAlign(ctx),
    maxLines,
    textOverflow: "ellipsis" as const,
    ...(riso ? { textTransform: "uppercase" as const } : {}),
  };
  if (!riso) return <Text style={style}>{zine.title}</Text>;
  return (
    <View>
      <Text style={{ ...style, position: "absolute", top: u(3), left: u(4), right: -u(4), color: palette.accent }}>{zine.title}</Text>
      <Text style={style}>{zine.title}</Text>
    </View>
  );
}

function Description({ ctx, maxLines }: { ctx: TemplateContext; maxLines: number }) {
  const { zine, faces, palette, u } = ctx;
  if (!zine.description) return null;
  return (
    <Text style={{ ...faces.text, fontSize: u(10.5), lineHeight: 1.45, textAlign: textAlign(ctx), color: palette.muted, marginTop: u(10), maxLines, textOverflow: "ellipsis" }}>
      {zine.description}
    </Text>
  );
}

function Byline({ ctx }: { ctx: TemplateContext }) {
  const { zine, faces, palette, u } = ctx;
  const line = { ...faces.detail, fontSize: u(8), letterSpacing: u(1), textTransform: "uppercase" as const, color: palette.muted };
  if (centred(ctx)) {
    return <Text style={{ ...line, textAlign: "center" }}>{[zine.authorName, monthOf(zine.publishedAt)].filter(Boolean).join(" · ")}</Text>;
  }
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ ...line, flexGrow: 1, flexBasis: 0, marginRight: u(12), maxLines: 1, textOverflow: "ellipsis" }}>{zine.authorName ?? ""}</Text>
      <Text style={line}>{monthOf(zine.publishedAt)}</Text>
    </View>
  );
}

function TitleCover({ ctx }: { ctx: TemplateContext }) {
  const { palette, u } = ctx;
  return (
    <View style={{ flexGrow: 1, paddingHorizontal: u(34), paddingTop: u(34), paddingBottom: u(30) }}>
      <View style={{ flexGrow: 1, flexBasis: 0, justifyContent: "center", alignItems: centred(ctx) ? "center" : "stretch" }}>
        <Title ctx={ctx} size={ctx.settings.template === "riso" ? 60 : 46} comfortable={26} maxLines={7} />
        <View style={{ width: u(36), height: u(2), backgroundColor: palette.accent, marginTop: u(16), marginBottom: u(4) }} />
        <Description ctx={ctx} maxLines={9} />
      </View>
      <Byline ctx={ctx} />
    </View>
  );
}

function FullCover({ ctx }: { ctx: TemplateContext }) {
  const { zine, palette, u, width, height } = ctx;
  const cover = coverPage(zine);
  return (
    <View style={{ width, height }}>
      {cover ? <PdfImage src={cover.imageSrc} style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }} /> : null}
      {/* Solid, so the title reads whatever the photo is. */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: palette.page, paddingHorizontal: u(26), paddingTop: u(18), paddingBottom: u(20) }}>
        <Title ctx={ctx} size={30} comfortable={34} maxLines={4} />
        <View style={{ height: u(12) }} />
        <Byline ctx={ctx} />
      </View>
    </View>
  );
}

/** One to four photos, in rows that fill the box. */
export function PhotoGrid({ pages, gap }: { pages: PdfRenderedPageItem[]; gap: number }) {
  const rows = pages.length < 3 ? pages.map((p) => [p]) : pages.length === 3 ? [pages.slice(0, 1), pages.slice(1)] : [pages.slice(0, 2), pages.slice(2)];
  return (
    <View style={{ flexGrow: 1, flexBasis: 0 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", flexGrow: 1, flexBasis: 0, marginTop: r ? gap : 0 }}>
          {row.map((page, c) => (
            <View key={page.pageNumber} style={{ position: "relative", flexGrow: 1, flexBasis: 0, marginLeft: c ? gap : 0, overflow: "hidden" }}>
              <PdfImage src={page.imageSrc} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function GridCover({ ctx }: { ctx: TemplateContext }) {
  const { zine, settings, u } = ctx;
  const film = settings.template === "contact";
  const edge = settings.template === "gallery" ? 44 : settings.template === "darkroom" ? 0 : 22;
  return (
    <View style={{ flexGrow: 1, paddingBottom: u(26) }}>
      <View style={{ flexGrow: 1, flexBasis: 0, marginHorizontal: u(edge), marginTop: u(edge), ...(film ? { backgroundColor: FILM, padding: u(8) } : {}) }}>
        <PhotoGrid pages={zine.pages.slice(0, 4)} gap={u(settings.template === "gallery" ? 10 : 5)} />
      </View>
      <View style={{ paddingHorizontal: u(28), paddingTop: u(20) }}>
        <Title ctx={ctx} size={32} comfortable={36} maxLines={4} />
        <Description ctx={ctx} maxLines={3} />
        <View style={{ height: u(16) }} />
        <Byline ctx={ctx} />
      </View>
    </View>
  );
}

/** The cover the creator chose. A booklet always goes through here. */
export function Cover({ ctx }: { ctx: TemplateContext }) {
  const { cover, template } = ctx.settings;
  if (cover.style === "title") return <TitleCover ctx={ctx} />;
  if (cover.style === "full") return <FullCover ctx={ctx} />;
  if (cover.style === "grid") return <GridCover ctx={ctx} />;
  const { Cover: TemplateCover } = PDF_TEMPLATES[template];
  return <TemplateCover ctx={ctx} />;
}
