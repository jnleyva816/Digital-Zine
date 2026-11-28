/**
 * Builds JPEG bytes carrying a Fujifilm maker note, for tests (DIG-23).
 *
 * Layout, per the ExifTool Fujifilm tag reference: an APP1 "Exif" segment holds a TIFF block,
 * IFD0 points to the Exif IFD, and the Exif IFD's MakerNote (0x927C) holds "FUJIFILM", then a
 * little-endian 32-bit offset to the maker-note IFD. That IFD is always little-endian, and its
 * value offsets are relative to the start of the maker note.
 */

export type FujiTagValue =
  | { type: "int16u"; value: number }
  | { type: "int32s"; value: number }
  | { type: "int32s[]"; value: number[] };

const TYPE_CODE = { int16u: 3, int32s: 9 } as const;

/** Encodes the maker note: header, IFD, then any values that don't fit in 4 bytes. */
export function buildFujiMakerNote(tags: Record<number, FujiTagValue>): Uint8Array<ArrayBuffer> {
  const entries = Object.entries(tags)
    .map(([tag, v]) => [Number(tag), v] as const)
    .sort((a, b) => a[0] - b[0]);
  const ifdOffset = 12;
  const ifdSize = 2 + entries.length * 12 + 4;
  const dataOffset = ifdOffset + ifdSize;
  const extra: number[] = [];
  const out: number[] = [...Buffer.from("FUJIFILM"), ...le32(ifdOffset), ...le16(entries.length)];
  for (const [tag, v] of entries) {
    if (v.type === "int16u") {
      out.push(...le16(tag), ...le16(TYPE_CODE.int16u), ...le32(1), ...le16(v.value), 0, 0);
    } else if (v.type === "int32s") {
      out.push(...le16(tag), ...le16(TYPE_CODE.int32s), ...le32(1), ...le32(v.value));
    } else {
      out.push(...le16(tag), ...le16(TYPE_CODE.int32s), ...le32(v.value.length), ...le32(dataOffset + extra.length));
      for (const n of v.value) extra.push(...le32(n));
    }
  }
  out.push(...le32(0), ...extra);
  return Uint8Array.from(out);
}

/**
 * A minimal JPEG (SOI, APP1 Exif, EOI) whose TIFF block uses the given byte order, with the
 * maker note in the Exif IFD. `make` goes in IFD0 so readers can tell it's a Fujifilm file.
 */
export function buildJpegWithMakerNote(
  makerNote: Uint8Array,
  { byteOrder = "MM", make = "FUJIFILM" }: { byteOrder?: "II" | "MM"; make?: string } = {}
): Uint8Array<ArrayBuffer> {
  const be = byteOrder === "MM";
  const u16 = (n: number) => (be ? be16(n) : le16(n));
  const u32 = (n: number) => (be ? be32(n) : le32(n));
  const makeBytes = [...Buffer.from(make), 0];

  // TIFF header (8) + IFD0 with 2 entries (Make, ExifIFDPointer) + Exif IFD with 1 entry.
  const ifd0Offset = 8;
  const ifd0Size = 2 + 2 * 12 + 4;
  const exifIfdOffset = ifd0Offset + ifd0Size;
  const exifIfdSize = 2 + 12 + 4;
  const makeOffset = exifIfdOffset + exifIfdSize;
  const makerNoteOffset = makeOffset + makeBytes.length;

  const tiff: number[] = [
    ...Buffer.from(byteOrder),
    ...u16(42),
    ...u32(ifd0Offset),
    ...u16(2),
    ...u16(0x010f), ...u16(2), ...u32(makeBytes.length), ...u32(makeOffset),
    ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfdOffset),
    ...u32(0),
    ...u16(1),
    ...u16(0x927c), ...u16(7), ...u32(makerNote.length), ...u32(makerNoteOffset),
    ...u32(0),
    ...makeBytes,
    ...makerNote,
  ];
  const app1 = [...Buffer.from("Exif\0\0"), ...tiff];
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...be16(app1.length + 2), ...app1, 0xff, 0xd9]);
}

/** Inserts an APP1 Exif segment right after a real JPEG's SOI marker (for e2e uploads). */
export function withMakerNote(jpeg: Uint8Array, makerNote: Uint8Array, make = "FUJIFILM"): Uint8Array<ArrayBuffer> {
  const app1Jpeg = buildJpegWithMakerNote(makerNote, { make });
  const app1 = app1Jpeg.subarray(2, app1Jpeg.length - 2);
  return Uint8Array.from([...jpeg.subarray(0, 2), ...app1, ...jpeg.subarray(2)]);
}

function le16(n: number) {
  return [n & 0xff, (n >> 8) & 0xff];
}
function le32(n: number) {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}
function be16(n: number) {
  return [(n >> 8) & 0xff, n & 0xff];
}
function be32(n: number) {
  return [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Maker-note tags for a Classic Chrome recipe, as a camera would write them. */
export const CLASSIC_CHROME_TAGS: Record<number, FujiTagValue> = {
  0x1001: { type: "int16u", value: 0x82 }, // Sharpness -1
  0x1002: { type: "int16u", value: 0xff0 }, // White balance: Kelvin
  0x1003: { type: "int16u", value: 0x100 }, // Color +2
  0x1005: { type: "int16u", value: 5200 }, // Color temperature
  0x100a: { type: "int32s[]", value: [40, -80] }, // WB shift: +2 red, -4 blue (x20)
  0x100e: { type: "int16u", value: 0x2e0 }, // Noise reduction -4
  0x100f: { type: "int32s", value: -3000 }, // Clarity -3
  0x1040: { type: "int32s", value: 32 }, // Shadow -2
  0x1041: { type: "int32s", value: -8 }, // Highlight +0.5
  0x1047: { type: "int32s", value: 32 }, // Grain: weak
  0x1048: { type: "int32s", value: 64 }, // Color Chrome: strong
  0x104c: { type: "int16u", value: 32 }, // Grain size: large
  0x104e: { type: "int32s", value: 32 }, // Color Chrome FX Blue: weak
  0x1401: { type: "int16u", value: 0x600 }, // Film mode: Classic Chrome
  0x1402: { type: "int16u", value: 0x1 }, // DR: manual
  0x1403: { type: "int16u", value: 200 }, // Development DR 200
};
