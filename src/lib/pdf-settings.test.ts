import { describe, expect, it } from "vitest";
import { MINI_PHOTO_LIMIT, PALETTES, TEMPLATES, defaultPdfSettings, parsePdfSettings, pdfSettingsSchema, withTemplate } from "./pdf-settings";

// DIG-64: what each zine remembers about its PDF. The API, the PDF, and the editor share this.
const base = defaultPdfSettings("darkroom", "letter");

describe("template defaults (owner, 19 Nov 2026)", () => {
  it.each([
    ["darkroom", "editorial", "ink", "outline"],
    ["contact", "technical", "fog", "label"],
    ["gallery", "gallery", "paper", "wall"],
    ["riso", "poster", "riso", "sticker"],
  ] as const)("%s suggests %s, %s, and a %s card", (template, typeface, palette, style) => {
    const s = defaultPdfSettings(template, "a4");
    expect(s).toMatchObject({ format: "booklet", template, typeface, palette, paper: "a4", captions: true, pageNumbers: true, recipeCards: true });
    expect(s.card.style).toBe(style);
    expect(pdfSettingsSchema.safeParse(s).success).toBe(true);
  });

  it("puts Riso's sticker on the photo, and the others beside the caption", () => {
    expect(defaultPdfSettings("riso", "a4").card.location).toBe("over-br");
    for (const t of ["darkroom", "contact", "gallery"] as const) expect(defaultPdfSettings(t, "a4").card.location).toBe("beside-caption");
  });
});

describe("withTemplate", () => {
  it("takes the new template's look and keeps the creator's other choices", () => {
    const mine = { ...base, format: "mini" as const, captions: false, inkSaver: true, miniPhotos: ["a"], card: { ...base.card, size: "full" as const, showExif: true } };
    const next = withTemplate(mine, "riso");
    expect(next).toMatchObject({ template: "riso", typeface: "poster", palette: "riso", format: "mini", captions: false, inkSaver: true, miniPhotos: ["a"], paper: "letter" });
    expect(next.card).toMatchObject({ style: "sticker", location: "over-br", size: "full", showExif: true });
  });
});

describe("validation", () => {
  it.each([
    ["an unknown template", { template: "neon" }],
    ["an unknown typeface", { typeface: "comic" }],
    ["an unknown palette", { palette: "lime" }],
    ["an unknown paper", { paper: "a3" }],
    ["an unknown card style", { card: { ...base.card, style: "x" } }],
    ["an extra key", { surprise: 1 }],
    ["too many mini photos", { miniPhotos: Array.from({ length: MINI_PHOTO_LIMIT + 1 }, (_, i) => `a${i}`) }],
    ["the same mini photo twice", { miniPhotos: ["a", "a"] }],
  ])("refuses %s", (_label, change) => {
    expect(pdfSettingsSchema.safeParse({ ...base, ...change }).success).toBe(false);
  });

  it("has no default style: nothing stored, or anything unreadable, is null", () => {
    for (const stored of [null, undefined, {}, "darkroom", { ...base, template: "gone" }]) expect(parsePdfSettings(stored)).toBeNull();
    expect(parsePdfSettings(base)).toEqual(base);
  });
});

describe("the palettes", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  it("keep text and muted text readable on every page colour", () => {
    for (const [name, p] of Object.entries(PALETTES)) {
      expect(contrast(p.text, p.page), `${name} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.muted, p.page), `${name} muted`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("every template has a description for the picker", () => {
    for (const t of Object.values(TEMPLATES)) expect(t.description.length).toBeGreaterThan(10);
  });
});
