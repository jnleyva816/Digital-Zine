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

const templates: PdfTemplate[] = ["darkroom", "contact", "gallery", "riso"];
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

// DIG-70: the recipe is a small card on the photo's page.
const fullRecipe = {
  name: "Kodachrome 64",
  filmSimulation: "Eterna Bleach Bypass" as const,
  dynamicRange: "DR-Auto" as const,
  grain: "Strong, Large" as const,
  colorChrome: "Strong" as const,
  colorChromeFxBlue: "Weak" as const,
  whiteBalance: { mode: "Auto (Ambience Priority)" as const, red: -9, blue: -9 },
  highlight: -1.5,
  shadow: 0.5,
  color: 2,
  sharpness: 1,
  clarity: 3,
  noiseReduction: -4,
  iso: "Auto up to ISO 12800",
  exposureCompensation: "-1 1/3 to +2 2/3",
};
const withCard = (card: Partial<PdfSettings["card"]>, template: PdfTemplate = "darkroom", over: Partial<PdfSettings> = {}) => {
  const s = defaultPdfSettings(template, "letter");
  return render({ ...s, ...over, card: { ...s.card, ...card } }, { pages: [item(1, { recipe: fullRecipe }), item(2)] });
};
const SIZES = {
  compact: ["Eterna Bleach Bypass", "DR-Auto", "Auto Ambience R-9 B-9"],
  standard: ["Strong, Large", "+2", "+3"],
  full: ["-1.5", "+0.5", "+1", "-4", "Auto 12800", "-1 1/3 to +2 2/3"],
};

describe.each(templates)("recipe cards in %s", (template) => {
  describe.each(["outline", "label", "wall", "sticker"] as const)("%s", (style) => {
    it.each(["compact", "standard", "full"] as const)("prints the %s settings, none of them broken across lines", async (size) => {
      const pages = await withCard({ style, size }, template);
      expect(pages).toHaveLength(3);
      const lines = pages[1].lines.map((l) => l.toLowerCase());
      const expected = size === "compact" ? SIZES.compact : size === "standard" ? [...SIZES.compact, ...SIZES.standard] : Object.values(SIZES).flat();
      for (const value of expected) expect(lines.some((l) => l.includes(value.toLowerCase())), `${value} in ${JSON.stringify(lines)}`).toBe(true);
      if (size === "compact") expect(lines.join()).not.toContain("strong, large");
    });
  });

  it.each(["over-tl", "over-tr", "over-br", "over-bl", "beside-caption", "under-caption"] as const)("places the card %s on one page", async (location) => {
    for (const size of ["standard", "full"] as const) {
      const pages = await withCard({ location, size }, template);
      expect(pages).toHaveLength(3);
      expect(pages[1].text.toLowerCase()).toContain("kodachrome 64");
    }
  });

  it("prints the one-line style as a single line", async () => {
    const pages = await withCard({ style: "line" }, template);
    expect(pages[1].text.toLowerCase()).toContain("kodachrome 64 · eterna bleach bypass · dr-auto");
  });

  it("puts no card on a photo without a recipe, or when cards are off", async () => {
    expect((await withCard({}, template))[2].text).not.toMatch(/kodachrome|bleach/i);
    expect((await withCard({}, template, { recipeCards: false }))[1].text).not.toMatch(/kodachrome/i);
  });

  it("can leave out the name, and add camera settings", async () => {
    expect((await withCard({ showName: false }, template))[1].text).not.toMatch(/kodachrome/i);
    expect((await withCard({ showExif: true }, template))[1].text.toLowerCase()).toContain("f/2.8 · 1/250s · iso 400");
  });
});

describe("Contact Sheet (DIG-67)", () => {
  const contact = defaultPdfSettings("contact", "a4");
  const four = { pages: [item(1, { recipe }), item(2), item(3, { exif: null }), item(4)] };

  it("prints the camera, the frame number from page order, and the film along the edge", async () => {
    const pages = await render(contact, four);
    expect(pages).toHaveLength(5);
    for (const t of ["X-T5", "01A", "CLASSIC CHROME"]) expect(pages[1].text).toContain(t);
    for (const t of ["02A", "NO RECIPE"]) expect(pages[2].text).toContain(t);
    expect(pages[3].text).toContain("03A");
    expect(pages[3].text).not.toContain("X-T5");
    for (const p of pages) expect(p.text).not.toContain("undefined");
  });

  it("numbers up to four frames on the cover", async () => {
    const [cover] = await render(contact, four);
    for (const t of ["01A", "02A", "03A", "04A"]) expect(cover.text).toContain(t);
    expect(cover.text).toContain("Golden Hour Field Notes");
  });

  it("edge-prints in amber until the creator changes the palette", async () => {
    const amber = "0.9098039215686274 0.6392156862745098 0.23921568627450981 scn";
    expect((await render(contact, four))[1].content).toContain(amber);
    expect((await render({ ...contact, palette: "kodachrome" }, four))[1].content).not.toContain(amber);
  });
});

describe("Gallery (DIG-68)", () => {
  it("numbers its plates and prints the photo's own name, or nothing", async () => {
    const pages = await render(defaultPdfSettings("gallery", "a4"), { pages: [item(1, { name: "Fishing Boats at Golden Hour" }), item(2), item(3), item(4)] });
    expect(pages[1].text).toContain("PLATE 1");
    expect(pages[1].text).toContain("Fishing Boats at Golden Hour");
    expect(pages[2].text).toContain("PLATE 2");
    expect(pages[2].text).not.toMatch(/\.jpe?g|null/i);
    expect(pages[0].text).toContain("October 2026");
  });
});

describe("Riso (DIG-69)", () => {
  it("prints the title twice, off register, as text", async () => {
    const [cover] = await render(defaultPdfSettings("riso", "a4"));
    expect(cover.text.match(/GOLDEN/g)).toHaveLength(2);
    expect(cover.text).toContain("3 PAGES");
  });
  it("prints a large page number", async () => {
    const pages = await render(defaultPdfSettings("riso", "a4"));
    expect(pages[2].text).toContain("02");
  });
});
