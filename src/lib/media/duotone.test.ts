import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { duotone, duotoneColor } from "./duotone";

// DIG-69: Riso photos are two inks.
const ink1 = "#0058A3";
const ink2 = "#FF48B0";

describe("duotoneColor", () => {
  it("maps black to ink 1, white to ink 2, and mid grey halfway", () => {
    expect(duotoneColor(0, ink1, ink2)).toEqual([0, 88, 163]);
    expect(duotoneColor(255, ink1, ink2)).toEqual([255, 72, 176]);
    expect(duotoneColor(127.5, ink1, ink2)).toEqual([128, 80, 170]);
  });
});

describe("duotone", () => {
  const solid = (background: string) => sharp({ create: { width: 200, height: 160, channels: 3, background } }).png().toBuffer();
  const pixels = async (jpeg: Buffer) => sharp(jpeg).raw().toBuffer({ resolveWithObject: true });

  it("keeps the photo's size", async () => {
    const { info } = await pixels(await duotone(await solid("#808080"), { ink1, ink2, paper: "#F2EDE4" }));
    expect([info.width, info.height]).toEqual([200, 160]);
  });

  it("uses the palette's inks, whatever colour the photo was", async () => {
    const { data, info } = await pixels(await duotone(await solid("#000000"), { ink1: "#1F2A30", ink2: "#2F5D73", paper: "#E4E8E2" }));
    // Between halftone dots the paper does not show through.
    let darkest = [255, 255, 255];
    for (let i = 0; i < data.length; i += info.channels) if (data[i] + data[i + 1] + data[i + 2] < darkest[0] + darkest[1] + darkest[2]) darkest = [data[i], data[i + 1], data[i + 2]];
    darkest.forEach((c, i) => expect(Math.abs(c - [0x1f, 0x2a, 0x30][i])).toBeLessThan(14));
  });

  it("overlays a halftone: a flat photo comes out dotted", async () => {
    const { data, info } = await pixels(await duotone(await solid("#000000"), { ink1, ink2, paper: "#F2EDE4" }));
    const reds = new Set<number>();
    for (let i = 0; i < data.length; i += info.channels) reds.add(data[i]);
    expect(Math.max(...reds) - Math.min(...reds)).toBeGreaterThan(40);
  });
});
