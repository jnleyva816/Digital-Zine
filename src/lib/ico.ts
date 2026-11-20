/**
 * Packs PNG images into one ICO file (DIG-105). Every browser reads PNG inside ICO, so /favicon.ico
 * needs no image library beyond the one that made the PNGs.
 */
export function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  if (images.length === 0) throw new Error("An ICO needs at least one image.");
  for (const { size } of images) {
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`ICO images can be 1 to 256 px, not ${size}.`);
  }
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const at = 6 + i * 16;
    header[at] = size === 256 ? 0 : size; // width; 0 means 256
    header[at + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4); // color planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}
