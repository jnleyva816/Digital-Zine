"use client";

import { Fragment, isValidElement, useId, useMemo, type CSSProperties, type ReactElement, type ReactNode } from "react";
import Image from "next/image";
import { EditedPhoto } from "@/components/EditedPhoto";
import { withSourceWidth } from "@/lib/media/variant-urls";
import { frameLayout, type PhotoEdit } from "@/lib/photo-edit";
import type { PdfPalette, PdfSettings } from "@/lib/pdf-settings";
import { PDF_TEMPLATES } from "@/lib/pdf-templates";
import { templateContext } from "@/lib/pdf-templates/context";
import type { PdfRenderedPageItem, PdfZinePayload } from "@/lib/pdf-templates/types";
import { webFontFamily } from "./pdf-web-fonts";

export interface WebPhotoSource {
  src: string;
  edit: PhotoEdit | null;
  dims: { width: number; height: number } | null;
}

/** A page as the PDF would print it, with its photo as an address instead of bytes. */
export interface PreviewPage extends Omit<PdfRenderedPageItem, "imageSrc" | "imageFit"> {
  assetId: string;
  photo: WebPhotoSource;
}

export interface PreviewZine {
  title: string;
  description: string | null;
  authorName: string | null;
  publishedAt: string;
  pages: PreviewPage[];
}

/** About a third of A4. */
export const PREVIEW_WIDTH = 290;

type Inks = Pick<PdfPalette, "page" | "text" | "accent">;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** The browser's version of `src/lib/media/duotone.ts`: shadows in ink 1, highlights in ink 2. */
function DuotoneFilter({ id, inks }: { id: string; inks: Inks }) {
  const [dark, light] = [channels(inks.text), channels(inks.accent)];
  const table = (c: number) => `${dark[c]} ${light[c]}`;
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          {(["R", "G", "B"] as const).map((c) => {
            const Func = `feFunc${c}` as "feFuncR";
            return <Func key={c} type="linear" slope="1.15" intercept="-0.075" />;
          })}
        </feComponentTransfer>
        <feComponentTransfer>
          <feFuncR type="table" tableValues={table(0)} />
          <feFuncG type="table" tableValues={table(1)} />
          <feFuncB type="table" tableValues={table(2)} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

/** A photo filling its box, cropped and framed as it is everywhere else (DIG-33). On Riso it is in two inks. */
export function WebPhoto({ photo, fit, inks, halftone = true, sizes }: { photo: WebPhotoSource; fit: "cover" | "contain"; inks?: Inks; halftone?: boolean; sizes: string }) {
  const id = `duotone-${useId().replace(/\W/g, "")}`;
  const aspect = photo.edit ? frameLayout(photo.edit, photo.dims).aspect : 1;
  return (
    <span style={{ position: "absolute", inset: 0, overflow: "hidden", containerType: "size" }}>
      {inks ? <DuotoneFilter id={id} inks={inks} /> : null}
      <span style={{ position: "absolute", inset: 0, filter: inks ? `url(#${id})` : undefined }}>
        {photo.edit ? (
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: `${fit === "cover" ? "max" : "min"}(100cqw, ${100 * aspect}cqh)`,
            }}
          >
            <EditedPhoto as="span" src={photo.src} alt="" edit={photo.edit} dims={photo.dims} sizes={sizes} />
          </span>
        ) : (
          <Image src={withSourceWidth(photo.src, photo.dims?.width)} alt="" fill sizes={sizes} draggable={false} style={{ objectFit: fit }} />
        )}
      </span>
      {inks && halftone ? (
        <span
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.35,
            backgroundImage: `radial-gradient(circle, ${inks.page} 24%, transparent 26%)`,
            backgroundSize: "calc(100cqw / 78) calc(100cqw / 78)",
          }}
        />
      ) : null}
    </span>
  );
}

type PdfStyle = CSSProperties & { paddingHorizontal?: number; paddingVertical?: number; marginHorizontal?: number; marginVertical?: number; maxLines?: number };

/** A react-pdf style as CSS. */
function toCss(style: PdfStyle = {}): CSSProperties {
  const { paddingHorizontal, paddingVertical, marginHorizontal, marginVertical, maxLines, fontFamily, flexShrink, ...rest } = style;
  return {
    ...(paddingHorizontal !== undefined ? { paddingLeft: paddingHorizontal, paddingRight: paddingHorizontal } : {}),
    ...(paddingVertical !== undefined ? { paddingTop: paddingVertical, paddingBottom: paddingVertical } : {}),
    ...(marginHorizontal !== undefined ? { marginLeft: marginHorizontal, marginRight: marginHorizontal } : {}),
    ...(marginVertical !== undefined ? { marginTop: marginVertical, marginBottom: marginVertical } : {}),
    ...(maxLines !== undefined ? { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: maxLines, overflow: "hidden" } : {}),
    ...(fontFamily ? { fontFamily: webFontFamily(fontFamily) } : {}),
    // react-pdf treats 0 as 1.
    ...(flexShrink !== undefined ? { flexShrink: flexShrink || 1 } : {}),
    ...rest,
  };
}

/** react-pdf's layout defaults, which are not the browser's. */
const BOX: CSSProperties = { position: "relative", boxSizing: "border-box", minWidth: 0, minHeight: 0, flexShrink: 1, borderWidth: 0, borderStyle: "solid" };
const VIEW: CSSProperties = { ...BOX, display: "flex", flexDirection: "column", alignItems: "stretch" };
const TEXT: CSSProperties = { ...BOX, whiteSpace: "pre-wrap", overflowWrap: "break-word" };

interface DrawContext {
  inks?: Inks;
  sizes: string;
}

type AnyElement = ReactElement<Record<string, unknown> & { style?: PdfStyle; children?: ReactNode }>;

/**
 * Draws a PDF template's output as HTML, so the preview and the PDF are one drawing (DIG-71). Templates are
 * plain functions without hooks, so they can be called while drawing.
 */
function draw(node: ReactNode, ctx: DrawContext): ReactNode {
  if (Array.isArray(node)) return node.map((child, i) => <Fragment key={i}>{draw(child, ctx)}</Fragment>);
  if (!isValidElement(node)) return node;
  const { type, props } = node as AnyElement;
  if (type === Fragment) return draw(props.children, ctx);
  if (typeof type === "function") return draw((type as (p: unknown) => ReactNode)(props), ctx);
  switch (type) {
    case "VIEW":
      return <div style={{ ...VIEW, ...toCss(props.style) }}>{draw(props.children, ctx)}</div>;
    case "TEXT":
      return <div style={{ ...TEXT, ...toCss(props.style) }}>{draw(props.children, ctx)}</div>;
    case "IMAGE": {
      const { objectFit, ...style } = props.style ?? {};
      return (
        <div style={{ ...BOX, ...toCss(style) }}>
          <WebPhoto photo={props.src as WebPhotoSource} fit={objectFit === "contain" ? "contain" : "cover"} inks={ctx.inks} sizes={ctx.sizes} />
        </div>
      );
    }
    case "SVG": {
      const { style, children, ...rest } = props;
      return (
        <svg {...rest} style={{ flexShrink: 1, ...toCss(style) }}>
          {draw(children, ctx)}
        </svg>
      );
    }
    case "RECT":
      return <rect {...(props as object)} />;
    case "POLYGON":
      return <polygon {...(props as object)} />;
    default:
      throw new Error(`The PDF preview cannot draw ${String(type)}.`);
  }
}

/** One page of the PDF, scaled down: a third of its size unless told otherwise. Told to a screen reader as a picture: the controls and the zine's own text are elsewhere. */
export function PdfPagePreview({ settings, zine, page, label, width = PREVIEW_WIDTH }: { settings: PdfSettings; zine: PreviewZine; page: "cover" | PreviewPage; label: string; width?: number }) {
  const { payload, shown } = useMemo(() => {
    const pages = zine.pages.map(({ photo, ...rest }): PdfRenderedPageItem => ({
      ...rest,
      // The templates hand the source straight to `Image`, which `draw` gives to `WebPhoto`.
      imageSrc: photo as unknown as PdfRenderedPageItem["imageSrc"],
      imageFit: photo.edit ? "contain" : "cover",
    }));
    const full: PdfZinePayload = { ...zine, pages, settings };
    return { payload: full, shown: page === "cover" ? null : pages.find((p) => p.pageNumber === page.pageNumber) };
  }, [zine, settings, page]);

  const ctx = templateContext(payload);
  const { Cover, PhotoPage } = PDF_TEMPLATES[settings.template];
  const scale = width / ctx.width;
  const content = page === "cover" ? <Cover ctx={ctx} /> : shown ? <PhotoPage ctx={ctx} page={shown} /> : null;
  return (
    <div
      role="img"
      aria-label={label}
      className="relative shrink-0 overflow-hidden shadow-lg"
      style={{ width, height: ctx.height * scale, backgroundColor: ctx.palette.page, color: ctx.palette.text }}
    >
      <div
        style={{ ...VIEW, position: "absolute", top: 0, left: 0, width: ctx.width, height: ctx.height, overflow: "hidden", fontSize: 18, lineHeight: "normal", textRendering: "geometricPrecision", transform: `scale(${scale})`, transformOrigin: "0 0" }}
      >
        {draw(content, { inks: settings.template === "riso" ? ctx.palette : undefined, sizes: `${width}px` })}
      </div>
    </div>
  );
}
