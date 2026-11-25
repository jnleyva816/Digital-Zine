import { inflateSync } from "node:zlib";

/**
 * Reads the text back out of a PDF that react-pdf made, page by page, so tests check what prints.
 * Enough of the format for our own files: Flate streams, hex strings, and ToUnicode maps.
 */
export interface PdfPageText {
  width: number;
  height: number;
  /** The printed lines, in drawing order. Columns that share a baseline read as one line. */
  lines: string[];
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
      // By its stated length: the data itself may end in a line break.
      const length = Number(/\/Length (\d+)/.exec(dict)?.[1] ?? 0);
      const body = Buffer.from(m[2].slice(at + 7, at + 7 + length), "latin1");
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
    // Text is drawn in pieces (a line is split wherever the script changes), so pieces that sit on one
    // baseline are joined back into the line they print as, following moves and rotations.
    const runs: string[] = [];
    let font = new Map<number, string>();
    let m: number[] = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    let baseline: string | null = null;
    const ops = /(?<cm>(?:-?[\d.]+ ){6})cm\b|\/(?<font>F\d+) [\d.]+ Tf|\[(?<tj>[^\]]*)\] TJ|(?<=^|\s)(?<q>[qQ])(?=\s|$)/g;
    for (const { groups } of content.matchAll(ops)) {
      if (groups!.q === "q") stack.push(m);
      else if (groups!.q === "Q") m = stack.pop() ?? m;
      else if (groups!.cm) {
        const [a, b, c, d, e, f] = groups!.cm.trim().split(" ").map(Number);
        m = [a * m[0] + b * m[2], a * m[1] + b * m[3], c * m[0] + d * m[2], c * m[1] + d * m[3], e * m[0] + f * m[2] + m[4], e * m[1] + f * m[3] + m[5]];
      } else if (groups!.font) font = fonts.get(groups!.font) ?? new Map();
      else {
        const hex = [...groups!.tj!.matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join("");
        const text = (hex.match(/.{4}/g) ?? []).map((h) => font.get(parseInt(h, 16)) ?? "\ufffd").join("");
        const scale = Math.hypot(m[0], m[1]);
        // Distance from the page's origin across the direction the text runs in.
        const at = [m[0] / scale, m[1] / scale, (m[5] * m[0] - m[4] * m[1]) / scale].map((n) => n.toFixed(1)).join();
        if (at === baseline) runs[runs.length - 1] += text;
        else runs.push(text);
        baseline = at;
      }
    }
    return { width: box[2], height: box[3], lines: runs, text: runs.join(" ").replace(/\s+/g, " "), content };
  });
}
