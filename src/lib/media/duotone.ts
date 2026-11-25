import sharp from "sharp";

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

/** The ink for a brightness from 0 to 255: shadows in ink 1, highlights in ink 2. */
export function duotoneColor(luminance: number, ink1: string, ink2: string): Rgb {
  const [a, b] = [rgb(ink1), rgb(ink2)];
  return a.map((from, i) => Math.round(from + ((b[i] - from) * luminance) / 255)) as Rgb;
}

/**
 * A photo as a two-ink risograph (DIG-69): duotone, with a fine halftone of the paper showing
 * through. Done on the server because react-pdf cannot blend images.
 */
export async function duotone(image: Buffer, { ink1, ink2, paper }: { ink1: string; ink2: string; paper: string }): Promise<Buffer> {
  const { data, info } = await sharp(image).removeAlpha().greyscale().normalise().linear(1.15, -19).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const table = Array.from({ length: 256 }, (_, l) => duotoneColor(l, ink1, ink2));
  const stock = rgb(paper);
  const pitch = Math.max(5, width / 78);
  const radius = pitch * 0.24;
  const out = Buffer.allocUnsafe(width * height * 3);
  for (let y = 0; y < height; y++) {
    const dy = (y % pitch) - pitch / 2;
    for (let x = 0; x < width; x++) {
      const dx = (x % pitch) - pitch / 2;
      // About a third strength inside a dot, with a one-pixel soft edge.
      const show = 0.35 * Math.min(1, Math.max(0, radius - Math.sqrt(dx * dx + dy * dy) + 0.5));
      const ink = table[data[(y * width + x) * channels]];
      const at = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) out[at + c] = ink[c] + (stock[c] - ink[c]) * show;
    }
  }
  return sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}
