import { fujiRecipeSchema, type FilmSimulation, type FujiRecipe } from "./fuji-recipe";

/**
 * Reads a Fujifilm film recipe from a JPEG's maker note, in the browser, before upload (DIG-23).
 *
 * Format, per the ExifTool Fujifilm tag reference: APP1 "Exif" → TIFF (either byte order) →
 * IFD0 → Exif IFD → MakerNote (0x927C). The maker note starts with "FUJIFILM" and a little-endian
 * offset to its own IFD. That IFD is always little-endian, and its offsets are relative to the
 * start of the maker note. Only recipe settings are read; anything the app can't express is
 * left out rather than guessed. ISO and exposure compensation describe one shot, not the look,
 * so they're not read.
 */

export type FoundRecipe = Omit<FujiRecipe, "name">;

const FILM_MODES: Record<number, FilmSimulation> = {
  0x000: "Provia/Standard",
  0x120: "Astia/Soft",
  0x200: "Velvia/Vivid",
  0x400: "Velvia/Vivid",
  0x500: "Pro Neg. Std",
  0x501: "Pro Neg. Hi",
  0x600: "Classic Chrome",
  0x700: "Eterna/Cinema",
  0x800: "Classic Neg.",
  0x900: "Eterna Bleach Bypass",
  0xa00: "Nostalgic Neg.",
  0xb00: "Reala Ace",
};

/** Black-and-white simulations are recorded in the saturation tag, not the film mode. */
const MONOCHROME: Record<number, FilmSimulation> = {
  0x300: "Monochrome",
  0x301: "Monochrome + R",
  0x302: "Monochrome + Ye",
  0x303: "Monochrome + G",
  0x310: "Sepia",
  0x500: "Acros",
  0x501: "Acros + R",
  0x502: "Acros + Ye",
  0x503: "Acros + G",
};

const COLOR: Record<number, number> = { 0x0: 0, 0x80: 1, 0x100: 2, 0xc0: 3, 0xe0: 4, 0x180: -1, 0x400: -2, 0x4c0: -3, 0x4e0: -4 };
const SHARPNESS: Record<number, number> = { 0x0: -4, 0x1: -3, 0x2: -2, 0x82: -1, 0x3: 0, 0x84: 1, 0x4: 2, 0x5: 3, 0x6: 4 };
const NOISE_REDUCTION: Record<number, number> = {
  0x0: 0, 0x180: 1, 0x100: 2, 0x1c0: 3, 0x1e0: 4, 0x280: -1, 0x200: -2, 0x2c0: -3, 0x2e0: -4,
};
const WHITE_BALANCE: Record<number, NonNullable<FujiRecipe["whiteBalance"]>["mode"]> = {
  0x0: "Auto",
  0x1: "Auto (White Priority)",
  0x2: "Auto (Ambience Priority)",
  0x100: "Daylight",
  0x200: "Shade",
  0x300: "Fluorescent 1",
  0x301: "Fluorescent 2",
  0x302: "Fluorescent 3",
  0x400: "Incandescent",
  0x600: "Underwater",
  0xff0: "Kelvin",
};
const CHROME_LEVEL: Record<number, "Off" | "Weak" | "Strong"> = { 0: "Off", 32: "Weak", 64: "Strong" };

const TAG = {
  sharpness: 0x1001,
  whiteBalance: 0x1002,
  saturation: 0x1003,
  colorTemperature: 0x1005,
  wbFineTune: 0x100a,
  noiseReduction: 0x100e,
  clarity: 0x100f,
  shadow: 0x1040,
  highlight: 0x1041,
  grainRoughness: 0x1047,
  colorChrome: 0x1048,
  grainSize: 0x104c,
  colorChromeFxBlue: 0x104e,
  filmMode: 0x1401,
  dynamicRangeSetting: 0x1402,
  developmentDynamicRange: 0x1403,
} as const;

type Tags = Map<number, number[]>;

/** The recipe settings found in the photo, or null if it isn't a readable Fujifilm JPEG. */
export function readFujiRecipe(buffer: ArrayBuffer): FoundRecipe | null {
  try {
    const tags = readMakerNoteTags(new DataView(buffer));
    return tags ? toRecipe(tags) : null;
  } catch {
    // Truncated or malformed files are simply "no recipe found".
    return null;
  }
}

function readMakerNoteTags(view: DataView): Tags | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let pos = 2;
  while (pos + 4 <= view.byteLength) {
    const marker = view.getUint16(pos);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda || marker === 0xffd9) return null;
    const length = view.getUint16(pos + 2);
    if (marker === 0xffe1 && isExifHeader(view, pos + 4)) {
      return readTiff(view, pos + 10, length - 8);
    }
    pos += 2 + length;
  }
  return null;
}

function isExifHeader(view: DataView, at: number) {
  return at + 6 <= view.byteLength && view.getUint32(at) === 0x45786966 && view.getUint16(at + 4) === 0;
}

function readTiff(view: DataView, tiff: number, length: number): Tags | null {
  const end = Math.min(view.byteLength, tiff + length);
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  if (u16(tiff + 2) !== 42) return null;

  const findEntry = (ifd: number, tag: number) => {
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > end) return null;
      if (u16(entry) === tag) return entry;
    }
    return null;
  };

  const ifd0 = tiff + u32(tiff + 4);
  const make = findEntry(ifd0, 0x010f);
  if (make === null || !readAscii(view, tiff + u32(make + 8), u32(make + 4)).toUpperCase().startsWith("FUJIFILM")) {
    return null;
  }
  const exifPointer = findEntry(ifd0, 0x8769);
  if (exifPointer === null) return null;
  const makerNoteEntry = findEntry(tiff + u32(exifPointer + 8), 0x927c);
  if (makerNoteEntry === null) return null;
  const note = tiff + u32(makerNoteEntry + 8);
  const noteLength = u32(makerNoteEntry + 4);
  if (note + noteLength > end || readAscii(view, note, 8) !== "FUJIFILM") return null;
  return readMakerNoteIfd(view, note, note + noteLength);
}

function readMakerNoteIfd(view: DataView, note: number, end: number): Tags {
  const ifd = note + view.getUint32(note + 8, true);
  const count = view.getUint16(ifd, true);
  const tags: Tags = new Map();
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) throw new RangeError("maker note IFD runs past its end");
    const tag = view.getUint16(entry, true);
    const type = view.getUint16(entry + 2, true);
    const n = view.getUint32(entry + 4, true);
    const size = type === 3 || type === 8 ? 2 : type === 4 || type === 9 ? 4 : 0;
    if (!size || n === 0 || n > 16) continue;
    const at = size * n <= 4 ? entry + 8 : note + view.getUint32(entry + 8, true);
    if (at + size * n > end) throw new RangeError("maker note value runs past its end");
    const values: number[] = [];
    for (let k = 0; k < n; k++) {
      const p = at + k * size;
      values.push(
        type === 3 ? view.getUint16(p, true) : type === 8 ? view.getInt16(p, true) : type === 4 ? view.getUint32(p, true) : view.getInt32(p, true)
      );
    }
    tags.set(tag, values);
  }
  return tags;
}

function readAscii(view: DataView, at: number, length: number) {
  let s = "";
  for (let i = 0; i < length && at + i < view.byteLength; i++) {
    const c = view.getUint8(at + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function toRecipe(tags: Tags): FoundRecipe | null {
  const first = (tag: number) => tags.get(tag)?.[0];
  const draft: Record<string, unknown> = {};

  const saturation = first(TAG.saturation);
  const mono = saturation !== undefined ? MONOCHROME[saturation] : undefined;
  const filmMode = first(TAG.filmMode);
  const sim = mono ?? (filmMode !== undefined ? FILM_MODES[filmMode] : undefined);
  if (sim) draft.filmSimulation = sim;

  const drSetting = first(TAG.dynamicRangeSetting);
  const devDr = first(TAG.developmentDynamicRange);
  if (drSetting === 0x0) draft.dynamicRange = "DR-Auto";
  else if (devDr === 100 || devDr === 200 || devDr === 400) draft.dynamicRange = `DR${devDr}`;

  const roughness = first(TAG.grainRoughness);
  if (roughness === 0) draft.grain = "Off";
  else if (roughness !== undefined) {
    const strength = roughness === 16 || roughness === 32 ? "Weak" : roughness === 48 || roughness === 64 ? "Strong" : null;
    const size = first(TAG.grainSize) === 32 ? "Large" : "Small";
    if (strength) draft.grain = `${strength}, ${size}`;
  }

  const cc = first(TAG.colorChrome);
  if (cc !== undefined && CHROME_LEVEL[cc]) draft.colorChrome = CHROME_LEVEL[cc];
  const ccb = first(TAG.colorChromeFxBlue);
  if (ccb !== undefined && CHROME_LEVEL[ccb]) draft.colorChromeFxBlue = CHROME_LEVEL[ccb];

  const wbCode = first(TAG.whiteBalance);
  const wbMode = wbCode !== undefined ? WHITE_BALANCE[wbCode] : undefined;
  if (wbMode) {
    const wb: Record<string, unknown> = { mode: wbMode, red: 0, blue: 0 };
    if (wbMode === "Kelvin") wb.kelvin = first(TAG.colorTemperature);
    const shift = tags.get(TAG.wbFineTune);
    if (shift && shift.length >= 2) {
      // Newer bodies store 20 units per step; older ones store the step itself.
      const [r, b] = shift.every((v) => v % 20 === 0) ? [shift[0] / 20, shift[1] / 20] : [shift[0], shift[1]];
      wb.red = r;
      wb.blue = b;
    }
    if (!(wbMode === "Kelvin" && wb.kelvin === undefined)) draft.whiteBalance = wb;
  }

  const tone = (tag: number) => {
    const v = first(tag);
    return v === undefined ? undefined : -v / 16;
  };
  const highlight = tone(TAG.highlight);
  if (highlight !== undefined) draft.highlight = highlight;
  const shadow = tone(TAG.shadow);
  if (shadow !== undefined) draft.shadow = shadow;

  if (!mono && saturation !== undefined && COLOR[saturation] !== undefined) draft.color = COLOR[saturation];
  const sharp = first(TAG.sharpness);
  if (sharp !== undefined && SHARPNESS[sharp] !== undefined) draft.sharpness = SHARPNESS[sharp];
  const clarity = first(TAG.clarity);
  if (clarity !== undefined && clarity % 1000 === 0) draft.clarity = clarity / 1000;
  const nr = first(TAG.noiseReduction);
  if (nr !== undefined && NOISE_REDUCTION[nr] !== undefined) draft.noiseReduction = NOISE_REDUCTION[nr];

  // A recipe needs a film simulation. Each setting is validated on its own, so one odd value
  // drops only that setting.
  if (!draft.filmSimulation) return null;
  const found: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    const probe = fujiRecipeSchema.safeParse({ name: "x", filmSimulation: draft.filmSimulation, [key]: value });
    if (probe.success) found[key] = value;
  }
  return found as FoundRecipe;
}
