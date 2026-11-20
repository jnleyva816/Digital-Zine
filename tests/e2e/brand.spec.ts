import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/** DIG-105: favicon, app icons, web manifest, theme color, and the default share image. */
const pngSize = (b: Buffer) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });
const isPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

test.describe("icons", () => {
  test("/favicon.ico is an ICO holding 16, 32, and 48 px images", async ({ request }) => {
    const res = await request.get("/favicon.ico");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/);
    const body = await res.body();
    expect(body.readUInt16LE(2)).toBe(1);
    const count = body.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => body[6 + i * 16]);
    expect(sizes).toEqual([16, 32, 48]);
    for (let i = 0; i < count; i++) {
      const offset = body.readUInt32LE(6 + i * 16 + 12);
      expect(isPng(body.subarray(offset, offset + 8) as Buffer), `image ${i} is a PNG`).toBe(true);
    }
  });

  test("/icon.svg is a scalable SVG in the brand colors", async ({ request }) => {
    const res = await request.get("/icon.svg");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/image\/svg\+xml/);
    const svg = await res.text();
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain("#161412");
    expect(svg).toContain("#D94E28");
  });

  for (const [url, size] of [
    ["/apple-touch-icon.png", 180],
    ["/icon-192.png", 192],
    ["/icon-512.png", 512],
    ["/icon-maskable-512.png", 512],
  ] as const) {
    test(`${url} is a ${size} px PNG`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      const body = await res.body();
      expect(isPng(body as Buffer)).toBe(true);
      expect(pngSize(body as Buffer)).toEqual({ width: size, height: size });
      expect(body.length).toBeGreaterThan(300);
      expect(body.length).toBeLessThan(60_000);
    });
  }

  test("the apple touch icon has no transparency, because iOS paints it black", async () => {
    const { default: sharp } = await import("sharp");
    const file = fs.readFileSync(path.join(process.cwd(), "public", "apple-touch-icon.png"));
    const meta = await sharp(file).metadata();
    expect(meta.hasAlpha ? (await sharp(file).stats()).isOpaque : true).toBe(true);
  });
});

test.describe("manifest", () => {
  test("parses, and every icon it lists exists", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
    const m = await res.json();
    expect(m.name).toBeTruthy();
    expect(m.icons.length).toBeGreaterThanOrEqual(4);
    for (const icon of m.icons) {
      const r = await request.get(icon.src);
      expect(r.status(), icon.src).toBe(200);
    }
  });
});

test.describe("the landing page head", () => {
  test("links the icons and manifest, and sets a theme color for light and dark", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const head = html.split("</head>")[0];
    expect(head).toMatch(/<link[^>]*rel="icon"[^>]*href="\/favicon\.ico/);
    expect(head).toMatch(/<link[^>]*rel="icon"[^>]*href="\/icon\.svg/);
    expect(head).toMatch(/<link[^>]*rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png/);
    expect(head).toMatch(/<link[^>]*rel="manifest"[^>]*href="\/manifest\.webmanifest/);
    // Attribute order is the framework's choice, so read each theme-color tag's attributes instead.
    const themeColors = [...head.matchAll(/<meta\b[^>]*name="theme-color"[^>]*>/g)].map((m) => m[0]);
    const colorFor = (scheme: string) => themeColors.find((t) => t.includes(`(prefers-color-scheme: ${scheme})`))?.match(/content="([^"]+)"/)?.[1];
    expect(colorFor("light")).toBe("#FDFBF7");
    expect(colorFor("dark")).toBe("#161412");
  });

  test("shares a 1200 x 630 image on Open Graph and Twitter, as a large card", async ({ request, baseURL }) => {
    const head = (await (await request.get("/")).text()).split("</head>")[0];
    const og = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/.exec(head)?.[1];
    const tw = /<meta[^>]*name="twitter:image"[^>]*content="([^"]+)"/.exec(head)?.[1];
    expect(og, "og:image").toBeTruthy();
    expect(tw, "twitter:image").toBeTruthy();
    expect(head).toMatch(/name="twitter:card"[^>]*content="summary_large_image"/);
    expect(head).toMatch(/property="og:image:width"[^>]*content="1200"/);
    expect(head).toMatch(/property="og:image:height"[^>]*content="630"/);
    for (const url of [og!, tw!]) {
      expect(url.startsWith(baseURL!), url).toBe(true);
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      expect(pngSize((await res.body()) as Buffer)).toEqual({ width: 1200, height: 630 });
    }
  });

  test("the share image is public, so the CSP and Origin check do not get in its way", async ({ request }) => {
    const res = await request.get("/opengraph-image");
    expect(res.status()).toBe(200);
  });
});
