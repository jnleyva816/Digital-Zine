import React from "react";
import { Image as PdfImage, Line, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { miniInnerPages, type MiniInnerPage } from "@/lib/pdf/mini-zine";
import { cardRows } from "@/lib/pdf/recipe-card";
import type { FujiRecipe } from "@/lib/fuji/fuji-recipe";
import { PhotoGrid } from "./covers";
import { FillPhoto, cameraLine, coverPage, fitTitle, monthOf, twoDigits } from "./shared";
import type { PdfRenderedPageItem, TemplateContext } from "./types";

/** Home printers cannot print the outer quarter inch. */
const MARGIN = 18;
/** Readable on a panel an eighth of a sheet in size. */
const SMALL = 9;
/** Every bundled detail face is monospaced, 0.6 em wide. */
const MONO = 0.6;
const FILM = "#111111";

interface MiniProps {
  ctx: TemplateContext;
  publicUrl: string;
}
/** A panel's own size, an eighth of the sheet. */
interface PanelProps extends MiniProps {
  inner: { width: number; height: number };
}

const detail = ({ faces, palette }: TemplateContext) => ({ ...faces.detail, fontSize: SMALL, color: palette.muted });
const eyebrow = ({ faces, palette }: TemplateContext) => ({ ...faces.detail, fontSize: SMALL, letterSpacing: 1, color: palette.accent });
const heading = (ctx: TemplateContext, text: string, size: number, comfortable: number) => ({
  ...ctx.faces.heading,
  fontSize: Math.max(11, fitTitle(text, size, comfortable)),
  lineHeight: 1.12,
  textOverflow: "ellipsis" as const,
});

/** On Riso the title prints in both inks, slightly off register. */
function Title({ ctx, size, maxLines }: { ctx: TemplateContext; size: number; maxLines: number }) {
  const { zine, settings, palette } = ctx;
  const style = { ...heading(ctx, zine.title, size, 28), maxLines };
  if (settings.template !== "riso") return <Text style={style}>{zine.title}</Text>;
  return (
    <View>
      <Text style={{ ...style, position: "absolute", top: 1.2, left: 1.5, right: -1.5, color: palette.accent }}>{zine.title}</Text>
      <Text style={style}>{zine.title}</Text>
    </View>
  );
}

/** The photo, in the template's own treatment. It takes whatever height the words leave. */
function Photo({ ctx, page, width }: { ctx: TemplateContext; page: PdfRenderedPageItem; width: number }) {
  const { settings, palette } = ctx;
  if (settings.template === "gallery") {
    return (
      <View style={{ flexGrow: 1, flexBasis: 0, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
        <FillPhoto page={page} />
      </View>
    );
  }
  if (settings.template === "contact") {
    // A black strip of film is most of the ink on the sheet, so ink saver outlines it.
    const film = settings.inkSaver ? palette.page : FILM;
    const hole = settings.inkSaver ? palette.muted : palette.page;
    const count = Math.floor(width / 9);
    const holes = (
      <Svg width={width} height={8} viewBox={`0 0 ${width} 8`}>
        {Array.from({ length: count }, (_, i) => (
          <Rect key={i} x={(width - count * 9) / 2 + 2.5 + i * 9} y={2.5} width={4} height={3} rx={0.8} ry={0.8} fill={hole} />
        ))}
      </Svg>
    );
    return (
      <View style={{ flexGrow: 1, flexBasis: 0, backgroundColor: film }}>
        {holes}
        <FillPhoto page={page} />
        {holes}
      </View>
    );
  }
  return <FillPhoto page={page} />;
}

function Front({ ctx, inner }: PanelProps) {
  const { zine, settings, faces, palette } = ctx;
  const style = settings.cover.style;
  const cover = coverPage(zine);
  return (
    <>
      {style === "full" ? null : <Text style={{ ...eyebrow(ctx), marginBottom: 6 }}>FOLIO · MINI ZINE</Text>}
      {style === "title" ? (
        <View style={{ flexGrow: 1, flexBasis: 0, justifyContent: "center" }}>
          <Title ctx={ctx} size={24} maxLines={7} />
          <View style={{ width: 24, height: 1.5, backgroundColor: palette.accent, marginTop: 10 }} />
        </View>
      ) : (
        <>
          {style === "grid" ? (
            <PhotoGrid pages={zine.pages.slice(0, 4)} gap={3} />
          ) : cover && style === "full" ? (
            <View style={{ flexGrow: 1, flexBasis: 0, marginHorizontal: -MARGIN, marginTop: -MARGIN }}>
              <FillPhoto page={{ ...cover, imageFit: "cover" }} />
            </View>
          ) : cover ? (
            <Photo ctx={ctx} page={cover} width={inner.width} />
          ) : null}
          <View style={{ marginTop: 8 }}>
            <Title ctx={ctx} size={18} maxLines={5} />
          </View>
        </>
      )}
      <Text style={{ ...faces.text, fontSize: SMALL, color: palette.muted, marginTop: 8 }}>{[zine.authorName, monthOf(zine.publishedAt)].filter(Boolean).join(" · ")}</Text>
    </>
  );
}

function Back({ ctx, inner, publicUrl }: PanelProps) {
  const { zine, faces, palette } = ctx;
  // Cut by hand, a character short of the edge, so the line breaker cannot add a hyphen that is not in the address.
  const size = Math.floor(inner.width / (SMALL * MONO)) - 1;
  const address = publicUrl.replace(/^https?:\/\//, "").match(new RegExp(`.{1,${size}}`, "g")) ?? [];
  return (
    <View style={{ marginTop: "auto" }}>
      <Text style={{ ...faces.caption, fontSize: 12, lineHeight: 1.3, marginBottom: 6 }}>
        {zine.pages.some((p) => p.recipe) ? "Read it online, and flip each photo to see its recipe." : "Read it online."}
      </Text>
      {address.map((part, i) => (
        <Text key={i} style={{ ...detail(ctx), color: palette.text, lineHeight: 1.35 }}>{part}</Text>
      ))}
      <Text style={{ ...eyebrow(ctx), color: palette.muted, marginTop: 10 }}>MADE WITH FOLIO</Text>
    </View>
  );
}

function Foot({ ctx, left, number }: { ctx: TemplateContext; left: string; number: number }) {
  const { settings, faces, palette } = ctx;
  const big = settings.template === "riso";
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
      <Text style={{ ...detail(ctx), flexGrow: 1, flexBasis: 0, marginRight: 8, maxLines: 1, textOverflow: "ellipsis" }}>{left}</Text>
      {settings.pageNumbers ? <Text style={big ? { ...faces.heading, fontSize: 24, lineHeight: 1, color: palette.accent } : detail(ctx)}>{String(number)}</Text> : null}
    </View>
  );
}

function PhotoPanel({ ctx, inner, page, number }: PanelProps & { page: PdfRenderedPageItem; number: number }) {
  const { settings, faces, palette } = ctx;
  const camera = cameraLine(page.exif && { cameraModel: page.exif.cameraModel, aperture: page.exif.aperture });
  const left = settings.recipeCards && page.recipe ? page.recipe.name : camera;
  return (
    <>
      <Photo ctx={ctx} page={page} width={inner.width} />
      {settings.captions && page.caption ? (
        <Text style={{ ...faces.caption, fontSize: 10, lineHeight: 1.3, marginTop: 8, maxLines: 3, textOverflow: "ellipsis", textAlign: settings.template === "gallery" ? "center" : "left" }}>
          {page.caption}
        </Text>
      ) : null}
      {settings.template === "contact" ? (
        <Text style={{ ...detail(ctx), color: palette.accent, marginTop: 5 }}>{`${twoDigits(page.pageNumber)}A`}</Text>
      ) : null}
      <Foot ctx={ctx} left={left} number={number} />
    </>
  );
}

function Intro({ ctx, number }: { ctx: TemplateContext; number: number }) {
  const { zine, faces, palette } = ctx;
  return (
    <>
      <View style={{ flexGrow: 1, flexBasis: 0, overflow: "hidden" }}>
        <Title ctx={ctx} size={16} maxLines={5} />
        {zine.description ? (
          <Text style={{ ...faces.text, fontSize: SMALL, lineHeight: 1.45, color: palette.muted, marginTop: 8, maxLines: 11, textOverflow: "ellipsis" }}>{zine.description}</Text>
        ) : null}
      </View>
      <Foot ctx={ctx} left="" number={number} />
    </>
  );
}

/** Each recipe once, however many photos share it. */
function uniqueRecipes(pages: PdfRenderedPageItem[]): FujiRecipe[] {
  const seen = new Map<string, FujiRecipe>();
  for (const { recipe } of pages) if (recipe) seen.set(JSON.stringify(recipe), recipe);
  return [...seen.values()];
}

function Recipes({ ctx, recipes, number }: { ctx: TemplateContext; recipes: FujiRecipe[]; number: number }) {
  const { faces, palette, settings } = ctx;
  // Four or five cards only fit without their boxes.
  const dense = recipes.length > 3;
  const style = settings.card.style;
  const boxed = !dense && style !== "wall" && style !== "line";
  const box = boxed
    ? { borderWidth: style === "sticker" ? 1.5 : 1, borderColor: style === "sticker" ? palette.accent : palette.muted, borderRadius: style === "outline" ? 3 : 0, padding: 7 }
    : { borderTopWidth: 1, borderTopColor: palette.muted, paddingTop: 3 };
  return (
    <>
      <Text style={{ ...eyebrow(ctx), marginBottom: 6 }}>RECIPES</Text>
      {recipes.map((recipe, i) => {
        const rows = cardRows(recipe, "compact");
        const wb = rows.find((r) => r.label === "WB");
        return (
          <View key={i} style={{ ...box, marginBottom: dense ? 5 : 8 }}>
            {settings.card.showName ? <Text style={{ ...faces.heading, fontSize: dense ? 10 : 12, lineHeight: 1.4, maxLines: 1, textOverflow: "ellipsis" }}>{recipe.name}</Text> : null}
            <Text style={{ ...detail(ctx), lineHeight: 1.2 }}>{rows.filter((r) => r !== wb).map((r) => r.value).join(", ")}</Text>
            {wb ? <Text style={{ ...detail(ctx), lineHeight: 1.2 }}>{`WB ${wb.value}`}</Text> : null}
          </View>
        );
      })}
      <View style={{ marginTop: "auto" }}>
        <Foot ctx={ctx} left="" number={number} />
      </View>
    </>
  );
}

/** Dashed folds between the panels, and the cut along the middle crease between the centre columns. */
function Guides({ ctx }: { ctx: TemplateContext }) {
  const { width: w, height: h, palette } = ctx;
  const fold = { stroke: palette.muted, strokeWidth: 0.6, strokeDasharray: "4 3" };
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", top: 0, left: 0 }}>
      {[1, 2, 3].map((i) => (
        <Line key={i} x1={(w * i) / 4} y1={0} x2={(w * i) / 4} y2={h} {...fold} />
      ))}
      <Line x1={0} y1={h / 2} x2={w / 4} y2={h / 2} {...fold} />
      <Line x1={(w * 3) / 4} y1={h / 2} x2={w} y2={h / 2} {...fold} />
      <Line x1={w / 4} y1={h / 2} x2={(w * 3) / 4} y2={h / 2} stroke={palette.accent} strokeWidth={1.5} />
    </Svg>
  );
}

/** Eight panels on one sheet: 5 4 3 2 upside down over 6 7 back front (DIG-73). */
export function MiniSheet({ ctx, publicUrl }: MiniProps) {
  const { zine, settings } = ctx;
  const size = { width: ctx.width / 4, height: ctx.height / 2 };
  const props: PanelProps = { ctx, publicUrl, inner: { width: size.width - 2 * MARGIN, height: size.height - 2 * MARGIN } };
  const recipes = uniqueRecipes(zine.pages);
  const pages = miniInnerPages(zine.pages, settings.recipePage && recipes.length > 0);
  const draw = (page: MiniInnerPage<PdfRenderedPageItem>, number: number) => {
    if (page.kind === "photo") return <PhotoPanel {...props} page={page.photo} number={number} />;
    if (page.kind === "intro") return <Intro ctx={ctx} number={number} />;
    if (page.kind === "recipes") return <Recipes ctx={ctx} recipes={recipes} number={number} />;
    return null;
  };
  const inner = pages.map((page, i) => draw(page, i + 2));
  const panels = [...inner.slice(0, 4).reverse(), inner[4], inner[5], <Back key="back" {...props} />, <Front key="front" {...props} />];
  return (
    <>
      {panels.map((panel, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: (i % 4) * size.width,
            top: i < 4 ? 0 : size.height,
            ...size,
            padding: MARGIN,
            overflow: "hidden",
            ...(i < 4 ? { transform: "rotate(180deg)" } : {}),
          }}
        >
          {panel}
        </View>
      ))}
      {settings.guides ? <Guides ctx={ctx} /> : null}
    </>
  );
}
