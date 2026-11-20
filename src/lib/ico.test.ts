import { describe, expect, it } from "vitest";
import { buildIco } from "./ico";

// DIG-105: /favicon.ico is an ICO file holding PNG images, which every browser reads.
const png = (n: number) => Buffer.from(`png-${n}`);

describe("buildIco", () => {
  const ico = buildIco([
    { size: 16, png: png(16) },
    { size: 32, png: png(32) },
  ]);

  it("starts with the ICO header: reserved 0, type 1, and the image count", () => {
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
  });

  it("describes each image: size, 32 bits, and where its bytes are", () => {
    for (const [i, size] of [16, 32].entries()) {
      const at = 6 + i * 16;
      expect(ico[at]).toBe(size);
      expect(ico[at + 1]).toBe(size);
      expect(ico.readUInt16LE(at + 4)).toBe(1);
      expect(ico.readUInt16LE(at + 6)).toBe(32);
      const length = ico.readUInt32LE(at + 8);
      const offset = ico.readUInt32LE(at + 12);
      expect(ico.subarray(offset, offset + length).toString()).toBe(`png-${size}`);
    }
  });

  it("writes 256 as 0, as the format asks", () => {
    expect(buildIco([{ size: 256, png: png(256) }])[6]).toBe(0);
  });

  it("refuses nothing to write, or a size ICO cannot hold", () => {
    expect(() => buildIco([])).toThrow();
    expect(() => buildIco([{ size: 512, png: png(512) }])).toThrow(/256/);
  });
});
