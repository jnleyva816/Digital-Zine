import React from "react";
import { Document, Page, View, renderToBuffer } from "@react-pdf/renderer";
import { registerPdfFonts } from "@/lib/pdf-fonts";
import { PDF_TEMPLATES } from "@/lib/pdf-templates";
import { templateContext } from "@/lib/pdf-templates/context";
import type { PdfZinePayload, TemplateContext } from "@/lib/pdf-templates/types";

export type { PdfRenderedPageItem, PdfZinePayload } from "@/lib/pdf-templates/types";

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
