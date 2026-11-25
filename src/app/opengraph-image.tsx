import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

/** The default share image: the landing page, and any page without its own (DIG-105). */
export const alt = "Folio: photo zines you can flip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: BRAND.paper, padding: "0 96px" }}>
        <div style={{ display: "flex", width: 300, height: 300, borderRadius: 66, background: BRAND.ink, alignItems: "center", justifyContent: "center", position: "relative" }}>
          <div style={{ display: "flex", width: 141, height: 188, borderRadius: 12, background: BRAND.paper, position: "relative" }}>
            <div style={{ position: "absolute", right: 0, bottom: 0, width: 47, height: 47, background: BRAND.vermilion, borderBottomRightRadius: 12 }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 72 }}>
          <div style={{ fontSize: 132, fontWeight: 700, color: BRAND.ink, letterSpacing: -4 }}>Folio</div>
          <div style={{ fontSize: 44, color: "#3D3730", marginTop: 8, maxWidth: 640, lineHeight: 1.25 }}>Photo zines you can flip.</div>
          <div style={{ width: 120, height: 8, background: BRAND.vermilion, marginTop: 36 }} />
        </div>
      </div>
    ),
    size
  );
}
