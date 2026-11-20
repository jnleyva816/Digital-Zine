import sharp from "sharp";

/** APP2 segments that hold an ICC colour profile are kept; they change how colours look. */
const ICC = Buffer.from("ICC_PROFILE\0", "latin1");

/**
 * Removes the metadata blocks from a baseline or progressive JPEG without touching the image data,
 * or null if the file is not laid out as expected. Keeps JFIF (APP0), ICC profiles (APP2), and
 * Adobe colour info (APP14); drops EXIF and XMP (APP1), MPF, IPTC, comments, and anything after
 * the main image, such as the camera's embedded previews (which carry their own EXIF).
 */
function stripSegments(jpeg: Buffer): Buffer | null {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  const out: Buffer[] = [jpeg.subarray(0, 2)];
  let i = 2;
  while (i + 2 <= jpeg.length) {
    if (jpeg[i] !== 0xff) return null;
    const marker = jpeg[i + 1];
    if (marker === 0xd9) {
      out.push(jpeg.subarray(i, i + 2));
      return Buffer.concat(out);
    }
    if (i + 4 > jpeg.length) return null;
    const length = jpeg.readUInt16BE(i + 2);
    const segment = jpeg.subarray(i, i + 2 + length);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep =
      !isApp
        ? marker !== 0xfe // drop comments
        : marker === 0xe0 || marker === 0xee || (marker === 0xe2 && segment.subarray(4, 4 + ICC.length).equals(ICC));
    if (keep) out.push(segment);
    i += 2 + length;
    if (marker === 0xda) {
      // Entropy-coded data runs until the next marker that is not stuffing (FF00) or a restart.
      const start = i;
      while (i + 1 < jpeg.length && !(jpeg[i] === 0xff && jpeg[i + 1] !== 0x00 && (jpeg[i + 1] < 0xd0 || jpeg[i + 1] > 0xd7))) i++;
      out.push(jpeg.subarray(start, i));
    }
  }
  return null;
}

/**
 * A copy of a JPEG with no EXIF, GPS, or other metadata (DIG-38). An upright photo is cleaned
 * losslessly. A photo that relies on the EXIF orientation flag is rotated and re-saved at high
 * quality instead, since dropping the flag would show it sideways.
 */
export async function cleanJpeg(input: Buffer): Promise<Buffer> {
  const { orientation } = await sharp(input).metadata();
  if (!orientation || orientation === 1) {
    const stripped = stripSegments(input);
    if (stripped) return stripped;
  }
  return sharp(input).rotate().jpeg({ quality: 95, mozjpeg: true }).toBuffer();
}
