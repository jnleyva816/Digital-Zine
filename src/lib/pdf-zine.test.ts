import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { readPdf } from "../../tests/pdf-text";
import { defaultPdfSettings as newPdfSettings, type PdfPaper, type PdfSettings, type PdfTemplate } from "./pdf-settings";
import { renderMiniZinePdfBuffer, renderZinePdfBuffer, type PdfRenderedPageItem, type PdfZinePayload } from "./pdf-zine";

// DIG-66: the PDF is drawn from the zine's chosen template, typeface, palette, and paper.
let jpeg: Buffer;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 80, height: 100, channels: 3, background: "#c0503a" } }).jpeg().toBuffer();
});

/** These tests are about each template's own cover; new zines start with the title only (DIG-126). */
const defaultPdfSettings = (template: PdfTemplate, paper: PdfPaper): PdfSettings => ({ ...newPdfSettings(template, paper), cover: { style: "template", photo: null } });

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

// DIG-73: the one-sheet mini zine.
describe("mini zine", () => {
  const four = () => [1, 2, 3, 4].map((n) => item(n, { recipe: n < 3 ? recipe : null }));
  const url = "https://folio-digital-zine.app/z/abcd1234/golden-hour-field-notes-issue-01";
  const raw = (settings: PdfSettings, over?: Partial<PdfZinePayload>) => renderMiniZinePdfBuffer({ ...payload(settings, { pages: four(), ...over }), publicUrl: url });
  const mini = async (settings: PdfSettings, over?: Partial<PdfZinePayload>) => {
    const pages = readPdf(await raw(settings, over));
    expect(pages).toHaveLength(1);
    return pages[0];
  };
  const letter = defaultPdfSettings("darkroom", "letter");
  const inOrder = (text: string, parts: string[]) => {
    const at = parts.map((p) => text.indexOf(p));
    expect(at, text).not.toContain(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  };

  it.each([["letter", 792, 612], ["a4", 841.89, 595.28]] as const)("is one landscape %s sheet", async (paper, w, h) => {
    const p = await mini({ ...letter, paper });
    expect(p.width).toBeCloseTo(w, 0);
    expect(p.height).toBeCloseTo(h, 0);
  });

  it("places pages 5 4 3 2 over 6 7 back front, with an intro first and recipes last", async () => {
    const { text } = await mini(letter);
    inOrder(text, ["Caption number 3", "Caption number 2", "Caption number 1", "Four frames from three evenings.", "Caption number 4", "RECIPES", "Read it online", "FOLIO · MINI ZINE"]);
    expect(text).toContain("Kodachrome 64");
    expect(text).toContain("Sam Ortega · October 2026");
  });

  it("turns the top row, and only the top row, upside down", async () => {
    const { content } = await mini(letter);
    expect(content.match(/-1 -?0 -?0 -1 [-\d.]+ [-\d.]+ cm/g)).toHaveLength(4);
  });

  it("gives six photos every page, and five leave a recipe page or else an intro", async () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => item(n, { recipe }));
    const full = (await mini(letter, { pages: six })).text;
    inOrder(full, ["number 4", "number 3", "number 2", "number 1", "number 5", "number 6"]);
    expect(full).not.toMatch(/RECIPES|Four frames/);
    const five = (await mini(letter, { pages: six.slice(0, 5) })).text;
    expect(five).toContain("RECIPES");
    expect(five).not.toContain("Four frames");
    const noRecipes = (await mini({ ...letter, recipePage: false }, { pages: six.slice(0, 5) })).text;
    expect(noRecipes).not.toContain("RECIPES");
    expect(noRecipes).toContain("Four frames");
  });

  it("lists a recipe shared by several photos once", async () => {
    expect((await mini({ ...letter, recipeCards: false })).text.match(/Kodachrome 64/g)).toHaveLength(1);
  });

  it("prints the whole public address without hyphens that are not in it, and no email", async () => {
    const { text } = await mini(letter);
    expect(text.replace(/\s/g, "")).toContain("folio-digital-zine.app/z/abcd1234/golden-hour-field-notes-issue-01");
  });

  it("draws fold lines and one cut line, unless guides are off", async () => {
    const on = (await mini(letter)).content;
    const dashes = /\[\s*4 3\s*\] 0 d/g;
    expect(on.match(dashes)).toHaveLength(5);
    expect(on).toMatch(/198 306 m\s+594 306 l/);
    const off = (await mini({ ...letter, guides: false })).content;
    expect(off).not.toMatch(dashes);
    expect(off).not.toMatch(/198 306 m\s+594 306 l/);
  });

  it("prints light pages with ink saver", async () => {
    const dark = (await mini(letter)).content;
    const light = (await mini({ ...letter, inkSaver: true })).content;
    const ink = "0.086 0.078 0.071";
    const background = (c: string) => /([\d. ]+) scn/.exec(c)![1].trim().split(" ").map((n) => Number(n).toFixed(3)).join(" ");
    expect(background(dark)).toBe(ink);
    expect(background(light)).not.toBe(ink);
  });

  it.each(templates)("%s never prints below 9 points and fits its longest content", async (template) => {
    for (const paper of ["letter", "a4"] as const)
      for (const typeface of ["editorial", "gallery", "technical", "typewriter", "poster"] as const) {
        const p = await mini({ ...defaultPdfSettings(template, paper), typeface }, {
          title: "An Extraordinarily Long Title About Golden Hours, Harbors, Ridgelines, and Everything Else Seen",
          description: "word ".repeat(80).trim(),
          pages: [1, 2, 3, 4, 5].map((n) => item(n, { caption: "A very long caption. ".repeat(20), recipe: { ...fullRecipe, name: `${n} Extremely long recipe name for one line` } })),
        });
        const sizes = [...p.content.matchAll(/\/F\d+ ([\d.]+) Tf/g)].map((m) => Number(m[1]));
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(9);
        for (const n of [1, 2, 3, 4, 5]) expect(p.text).toContain(`${n} Extremely`);
        expect(p.text, `${paper} ${typeface}`).toContain("Sam Ortega");
      }
  });
});

describe("cover options (DIG-126)", () => {
  const images = (content: string) => (content.match(/ Do\b/g) ?? []).length;
  const pages = (n: number) => ({ pages: Array.from({ length: n }, (_, i) => item(i + 1)) });
  const cover = (template: PdfTemplate, style: PdfSettings["cover"]["style"]) => ({ ...newPdfSettings(template, "a4"), cover: { style, photo: null } });
  const templates = ["darkroom", "contact", "gallery", "riso"] as const;

  it.each(templates)("%s: the title only has the words and no photo", async (template) => {
    const [first] = await render(cover(template, "title"), pages(3));
    const text = first.text.toLowerCase();
    for (const t of ["golden hour", "four frames from three evenings.", "sam ortega", "october 2026"]) expect(text).toContain(t);
    expect(images(first.content)).toBe(0);
  });

  it.each(templates)("%s: the full-page photo has one photo and the title", async (template) => {
    const [first] = await render(cover(template, "full"), pages(3));
    expect(first.text.toLowerCase()).toContain("golden hour");
    expect(images(first.content)).toBe(1);
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [6, 4],
  ])("the grid of a %i-photo zine has %i", async (count, shown) => {
    for (const template of templates) {
      const [first] = await render(cover(template, "grid"), pages(count));
      expect(images(first.content)).toBe(shown);
      expect(first.text.toLowerCase()).toContain("golden hour");
    }
  });

  it("stays one sheet with the longest title and description, on every cover", async () => {
    const long = { title: "Wide open harbors ".repeat(8).slice(0, 140), description: "A long description of the light. ".repeat(13).slice(0, 400), ...pages(4) };
    for (const template of templates) for (const style of ["title", "full", "grid"] as const) expect(await render(cover(template, style), long)).toHaveLength(5);
  });
});
