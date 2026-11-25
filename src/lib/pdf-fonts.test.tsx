import fs from "node:fs";
import path from "node:path";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FONT_FILES, FONT_ROOT, registerPdfFonts } from "./pdf-fonts";
import { TYPEFACE_FACES } from "./pdf-typefaces";
import { TYPEFACES, type PdfTypeface } from "./pdf-settings";

// DIG-65: the PDF prints in the typefaces creators pick, from files in the repo.
afterEach(() => vi.unstubAllGlobals());

describe("bundled fonts", () => {
  it("has every file, with its licence beside it", () => {
    for (const { file } of FONT_FILES) {
      const full = path.join(FONT_ROOT, file);
      expect(fs.existsSync(full), file).toBe(true);
      expect(fs.readFileSync(path.join(path.dirname(full), "OFL.txt"), "utf8"), file).toMatch(/SIL Open Font License/i);
    }
  });

  it("gives every typeface only faces that are bundled", () => {
    expect(Object.keys(TYPEFACE_FACES).sort()).toEqual(Object.keys(TYPEFACES).sort());
    const bundled = new Set(FONT_FILES.map((f) => `${f.family}|${f.fontWeight}|${f.fontStyle}`));
    for (const [name, faces] of Object.entries(TYPEFACE_FACES)) {
      for (const [role, f] of Object.entries(faces)) expect(bundled, `${name} ${role}`).toContain(`${f.fontFamily}|${f.fontWeight}|${f.fontStyle}`);
    }
  });
});

describe("rendering", () => {
  it.each(Object.keys(TYPEFACE_FACES) as PdfTypeface[])("renders %s with its fonts embedded and no network", async (name) => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("no network")));
    registerPdfFonts();
    const faces = TYPEFACE_FACES[name];
    const pdf = await renderToBuffer(
      <Document>
        <Page size="A4">
          {Object.entries(faces).map(([role, face]) => (
            <Text key={role} style={face}>
              Golden Hour: Été à Zürich, f/2.8 · 1/250 − “ok” 02/08
            </Text>
          ))}
        </Page>
      </Document>
    );
    const text = pdf.toString("latin1");
    for (const face of Object.values(faces)) expect(text, face.fontFamily).toMatch(new RegExp(`/BaseFont /[A-Z]+\\+${face.fontFamily.replace(/ /g, "")}`));
    expect(text).not.toMatch(/BaseFont \/(Helvetica|Times|Courier)\b(?!Prime)/);
  });

  it("is safe to register twice", () => {
    registerPdfFonts();
    registerPdfFonts();
  });
});
