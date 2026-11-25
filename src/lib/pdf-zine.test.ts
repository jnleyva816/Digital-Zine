import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { readPdf } from "../../tests/pdf-text";
import { defaultPdfSettings, type PdfSettings, type PdfTemplate } from "./pdf-settings";
import { renderZinePdfBuffer, type PdfRenderedPageItem, type PdfZinePayload } from "./pdf-zine";

// DIG-66: the PDF is drawn from the zine's chosen template, typeface, palette, and paper.
let jpeg: Buffer;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 80, height: 100, channels: 3, background: "#c0503a" } }).jpeg().toBuffer();
});

const exif = { cameraMake: "FUJIFILM", cameraModel: "X-T5", iso: 400, aperture: "f/2.8", shutterSpeed: "1/250s", focalLength: "33mm" };
const recipe = { name: "Kodachrome 64", filmSimulation: "Classic Chrome" as const, dynamicRange: "DR200" as const };

const item = (n: number, over: Partial<PdfRenderedPageItem> = {}): PdfRenderedPageItem => ({
  pageNumber: n,
  name: null,
  caption: `Caption number ${n}`,
  imageSrc: { data: jpeg, format: "jpg" },
  imageFit: "cover",
  exif,
  recipe: null,
  ...over,
});

const payload = (settings: PdfSettings, over: Partial<PdfZinePayload> = {}): PdfZinePayload => ({
  title: "Golden Hour Field Notes",
  description: "Four frames from three evenings.",
  authorName: "Sam Ortega",
  publishedAt: "2026-10-20T00:00:00.000Z",
  pages: [item(1), item(2, { recipe }), item(3, { exif: null })],
  settings,
  ...over,
});
const render = async (settings: PdfSettings, over?: Partial<PdfZinePayload>) => readPdf(await renderZinePdfBuffer(payload(settings, over)));
const darkroom = defaultPdfSettings("darkroom", "a4");

describe("paper", () => {
  it.each([
    ["a4", 595.28, 841.89],
    ["letter", 612, 792],
  ] as const)("prints every page on %s", async (paper, width, height) => {
    const pages = await render({ ...darkroom, paper });
    expect(pages).toHaveLength(4);
    for (const p of pages) {
      expect(p.width).toBeCloseTo(width, 0);
      expect(p.height).toBeCloseTo(height, 0);
    }
  });
});

describe("Darkroom", () => {
  it("has a cover with the title, description, byline, and month", async () => {
    const [cover] = await render(darkroom);
    for (const t of ["Golden Hour Field Notes", "Four frames from three evenings.", "SAM ORTEGA", "OCTOBER 2026"]) expect(cover.text).toContain(t);
  });

  it("has the caption, camera line, and page number on each photo page, and no separate recipe page", async () => {
    const pages = await render(darkroom);
    expect(pages[1].text).toContain("Caption number 1");
    expect(pages[1].text).toContain("X-T5 · 33MM · F/2.8 · 1/250S · ISO 400");
    expect(pages[1].text).toContain("01 / 03");
    expect(pages[3].text).toContain("03 / 03");
  });

  it("prints nothing for missing data: no undefined, no empty separators", async () => {
    const pages = await render(darkroom, { authorName: null, description: null, pages: [item(1, { exif: { cameraModel: "X-T5" }, caption: "" })] });
    for (const p of pages) {
      expect(p.text).not.toMatch(/undefined|null/);
      expect(p.text).not.toMatch(/·\s*·|·\s*$/);
    }
  });
});

describe("page options", () => {
  it("switch captions and page numbers off", async () => {
    const pages = await render({ ...darkroom, captions: false, pageNumbers: false });
    for (const p of pages) expect(p.text).not.toMatch(/Caption number|\d\d \/ \d\d/);
  });
});

const templates: PdfTemplate[] = ["darkroom"];
describe.each(templates)("%s with everything at its longest", (template) => {
  it.each(["letter", "a4"] as const)("stays on one page per photo on %s", async (paper) => {
    const pages = await render(defaultPdfSettings(template, paper), {
      title: "An Extraordinarily Long Title About Golden Hours, Harbors, Ridgelines, and Everything Else Seen On the Way Home".slice(0, 140),
      description: "d".repeat(20).concat(" words").repeat(15).slice(0, 400),
      pages: [item(1, { caption: "A very long caption. ".repeat(20).slice(0, 400), recipe, name: "Fishing Boats at Golden Hour" })],
    });
    expect(pages).toHaveLength(2);
  });

  it.each(["editorial", "gallery", "technical", "typewriter", "poster"] as const)("renders in the %s typeface", async (typeface) => {
    expect(await render({ ...defaultPdfSettings(template, "a4"), typeface })).toHaveLength(4);
  });

  it.each(["ink", "paper", "fog", "kodachrome", "riso"] as const)("renders in the %s palette", async (palette) => {
    expect(await render({ ...defaultPdfSettings(template, "a4"), palette })).toHaveLength(4);
  });
});
