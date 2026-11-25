import { inflateSync } from "node:zlib";

/**
 * Reads the text back out of a PDF that react-pdf made, page by page, so tests check what prints.
 * Enough of the format for our own files: Flate streams, hex strings, and ToUnicode maps.
 */
export interface PdfPageText {
  width: number;
  height: number;
  /** Each run of text, in drawing order. */
  runs: string[];
  text: string;
  /** The page's drawing operators, for checks on lines and shapes. */
  content: string;
}

export function readPdf(pdf: Buffer): PdfPageText[] {
  const raw = pdf.toString("latin1");
  const objects = new Map<number, { dict: string; stream: string }>();
  for (const m of raw.matchAll(/(\d+) 0 obj\r?\n([\s\S]*?)\r?\nendobj/g)) {
    const at = m[2].indexOf("stream\n");
    let dict = m[2];
    let stream = "";
    if (at >= 0) {
      dict = m[2].slice(0, at);
      const body = Buffer.from(m[2].slice(at + 7).replace(/\r?\nendstream$/, ""), "latin1");
      if (/FlateDecode/.test(dict)) {
        try {
          stream = inflateSync(body).toString("latin1");
        } catch {
          // An image or font file: not text.
        }
      } else stream = body.toString("latin1");
    }
    objects.set(Number(m[1]), { dict, stream });
  }
  const ref = (dict: string, key: string) => Number(new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(dict)?.[1] ?? 0);
  const utf16 = (hex: string) => (hex.match(/.{4}/g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16))).join("");

  const unicode = (fontId: number): Map<number, string> => {
    const map = new Map<number, string>();
    const cmap = objects.get(ref(objects.get(fontId)?.dict ?? "", "ToUnicode"))?.stream ?? "";
    for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const r of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([^\]]*)\]/g)) {
        [...r[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((u, i) => map.set(parseInt(r[1], 16) + i, utf16(u[1])));
      }
    }
    return map;
  };

  const pages = [...objects.values()].filter((o) => /\/Type\s*\/Page\b(?!s)/.test(o.dict));
  return pages.map(({ dict }) => {
    const box = /\/MediaBox \[([^\]]+)\]/.exec(dict)![1].trim().split(/\s+/).map(Number);
    const resources = /\/Resources\s+(\d+) 0 R/.test(dict) ? objects.get(ref(dict, "Resources"))!.dict : dict;
    const fonts = new Map<string, Map<number, string>>();
    const fontDict = /\/Font <<([\s\S]*?)>>/.exec(resources)?.[1] ?? "";
    for (const f of fontDict.matchAll(/\/(F\d+) (\d+) 0 R/g)) fonts.set(f[1], unicode(Number(f[2])));
    const content = objects.get(ref(dict, "Contents"))?.stream ?? "";
    const runs: string[] = [];
    let font = new Map<number, string>();
    for (const op of content.matchAll(/\/(F\d+) [\d.]+ Tf|\[([^\]]*)\] TJ/g)) {
      if (op[1]) font = fonts.get(op[1]) ?? new Map();
      else {
        const hex = [...op[2].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join("");
        runs.push((hex.match(/.{4}/g) ?? []).map((h) => font.get(parseInt(h, 16)) ?? "�").join(""));
      }
    }
    return { width: box[2], height: box[3], runs, text: runs.join(" ").replace(/\s+/g, " "), content };
  });
}
