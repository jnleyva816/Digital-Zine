/**
 * Draws the brand mark into the files browsers ask for (DIG-105). Run `npm run brand:generate`
 * after changing `src/lib/brand.ts`, and commit what it writes. They are committed rather than
 * built so the app serves them as plain files, with no image work at request time.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { brandMarkSvg } from "../src/lib/brand";
import { buildIco } from "../src/lib/ico";

const root = path.resolve(__dirname, "..");
const png = (svg: string, size: number) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

async function main() {
  const rounded = brandMarkSvg();
  const square = brandMarkSvg({ rounded: false });
  const maskable = brandMarkSvg({ rounded: false, scale: 0.72 });

  fs.writeFileSync(path.join(root, "src/app/icon.svg"), rounded);
  fs.writeFileSync(
    path.join(root, "src/app/favicon.ico"),
    buildIco(await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await png(rounded, size) }))))
  );
  const pub = (name: string, data: Buffer) => fs.writeFileSync(path.join(root, "public", name), data);
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  pub("apple-touch-icon.png", await png(square, 180)); // iOS rounds the corners itself and paints transparency black
  pub("icon-192.png", await png(rounded, 192));
  pub("icon-512.png", await png(rounded, 512));
  pub("icon-maskable-512.png", await png(maskable, 512));
  console.log("Wrote icon.svg, favicon.ico, and four PNGs.");
}

void main();
