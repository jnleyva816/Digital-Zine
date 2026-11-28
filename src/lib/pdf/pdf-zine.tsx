import React from "react";
import { Document, Page, View, renderToBuffer } from "@react-pdf/renderer";
import { registerPdfFonts } from "@/lib/pdf/pdf-fonts";
import { miniPalette } from "@/lib/pdf/mini-zine";
import { MiniSheet } from "@/lib/pdf/pdf-templates/mini";
import { PDF_TEMPLATES } from "@/lib/pdf/pdf-templates";
import { Cover } from "@/lib/pdf/pdf-templates/covers";
import { PAPER_POINTS, templateContext } from "@/lib/pdf/pdf-templates/context";
import type { PdfZinePayload, TemplateContext } from "@/lib/pdf/pdf-templates/types";

export type { PdfRenderedPageItem, PdfZinePayload } from "@/lib/pdf/pdf-templates/types";

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
  const { PhotoPage } = PDF_TEMPLATES[zine.settings.template];
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

export interface MiniZinePayload extends PdfZinePayload {
  /** The zine's full public address, printed on the back cover. */
  publicUrl: string;
}

/** The one-sheet mini zine (DIG-73): a landscape sheet that folds into an eight-page booklet. */
export async function renderMiniZinePdfBuffer(zine: MiniZinePayload): Promise<Buffer> {
  registerPdfFonts();
  const { width, height } = PAPER_POINTS[zine.settings.paper];
  const ctx: TemplateContext = { ...templateContext(zine), palette: miniPalette(zine.settings), width: height, height: width };
  return renderToBuffer(
    <Document title={zine.title} author={zine.authorName ?? undefined} subject={zine.description ?? "Digital Zine Edition"}>
      <Sheet ctx={ctx}>
        <MiniSheet ctx={ctx} publicUrl={zine.publicUrl} />
      </Sheet>
    </Document>
  );
}
