import React from "react";
import { Document, Page, View, renderToBuffer } from "@react-pdf/renderer";
import { registerPdfFonts } from "@/lib/pdf-fonts";
import { PALETTES, type PdfPaper, type PdfSettings } from "@/lib/pdf-settings";
import { TYPEFACE_FACES } from "@/lib/pdf-typefaces";
import { PDF_TEMPLATES } from "@/lib/pdf-templates";
import type { PdfZinePayload, TemplateContext } from "@/lib/pdf-templates/types";

export type { PdfRenderedPageItem, PdfZinePayload } from "@/lib/pdf-templates/types";

/** Page sizes in points. */
const PAPER_POINTS: Record<PdfPaper, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

/** The design canvas draws its pages 397 px wide. */
const CANVAS_WIDTH = 397;

export function templateContext(zine: PdfZinePayload, settings: PdfSettings = zine.settings): TemplateContext {
  const size = PAPER_POINTS[settings.paper];
  return {
    zine,
    settings,
    faces: TYPEFACE_FACES[settings.typeface],
    palette: PALETTES[settings.palette],
    ...size,
    u: (px) => (px * size.width) / CANVAS_WIDTH,
  };
}

/** One sheet, exactly. A page that wraps grows a second sheet; a page that does not is resized to its content. */
function Sheet({ ctx, children }: { ctx: TemplateContext; children: React.ReactNode }) {
  return (
    <Page size={[ctx.width, ctx.height]} style={{ backgroundColor: ctx.palette.page, color: ctx.palette.text }}>
      <View wrap={false} style={{ width: ctx.width, height: ctx.height, overflow: "hidden" }}>
        {children}
      </View>
    </Page>
  );
}

function Booklet({ zine }: { zine: PdfZinePayload }) {
  const ctx = templateContext(zine);
  const { Cover, PhotoPage } = PDF_TEMPLATES[zine.settings.template];
  return (
    <Document title={zine.title} author={zine.authorName ?? undefined} subject={zine.description ?? "Digital Zine Edition"}>
      <Sheet ctx={ctx}>
        <Cover ctx={ctx} />
      </Sheet>
      {zine.pages.map((page) => (
        <Sheet key={page.pageNumber} ctx={ctx}>
          <PhotoPage ctx={ctx} page={page} />
        </Sheet>
      ))}
    </Document>
  );
}

export async function renderZinePdfBuffer(payload: PdfZinePayload): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<Booklet zine={payload} />);
}
