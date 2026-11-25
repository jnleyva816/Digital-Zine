import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { writeLocalObject } from "@/lib/storage/local";
import { Prisma } from "@prisma/client";
import { GET } from "@/app/api/pdf/[slug]/route";
import { defaultPdfSettings, type PdfSettings } from "@/lib/pdf-settings";
import { processAsset } from "@/lib/media/process";
import { readPdf } from "../pdf-text";
import { createTestUser, defaultBoardId, deleteTestUser, params, resetRateLimits } from "./helpers";

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

type User = Awaited<ReturnType<typeof createTestUser>>;
let pro: User;
let free: User;
let otherPro: User;

beforeAll(async () => {
  [pro, free, otherPro] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
  await prisma.user.updateMany({ where: { id: { in: [pro.id, otherPro.id] } }, data: { tier: "pro" } });
  pro = { ...pro, tier: "pro" };
  otherPro = { ...otherPro, tier: "pro" };
});

afterAll(async () => {
  for (const u of [pro, free, otherPro]) await deleteTestUser(u.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetRateLimits();
  mockedUser.mockResolvedValue(pro);
  const ids = [pro.id, free.id, otherPro.id];
  await prisma.zine.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: ids } } });
});

/** An asset whose image really exists in local storage (unless `writeFile` is false). */
async function photo(ownerId: string, { writeFile = true } = {}) {
  const storageKey = `users/${ownerId}/${randomUUID()}.jpg`;
  if (writeFile) {
    const bytes = await sharp({ create: { width: 40, height: 50, channels: 3, background: "#c0503a" } })
      .jpeg()
      .toBuffer();
    await writeLocalObject(storageKey, bytes, "image/jpeg");
  }
  return prisma.mediaAsset.create({
    data: {
      ownerId,
      boardId: await defaultBoardId(ownerId),
      storageKey,
      publicUrl: `/api/media/${storageKey}`,
      exif: { iso: 400 },
    },
  });
}

async function zine(
  ownerId: string,
  assetIds: string[],
  { published = true, settings = defaultPdfSettings("darkroom", "a4") }: { published?: boolean; settings?: PdfSettings | null } = {}
) {
  return prisma.zine.create({
    data: {
      ownerId,
      boardId: await defaultBoardId(ownerId),
      title: "Brine & Light",
      slug: `pdf-${randomUUID().slice(0, 8)}`,
      published,
      pdfSettings: settings ?? Prisma.DbNull,
      publishedAt: published ? new Date("2026-11-02T12:00:00Z") : null,
      pages: {
        create: assetIds.map((assetId, i) => ({ pageNumber: i + 1, content: { assetId, caption: `Plate ${i + 1}` } })),
      },
    },
  });
}

const get = (slug: string) => GET(new Request(`http://test.local/api/pdf/${slug}`), params({ slug }));

/** Page objects in the PDF (the cover plus one per zine page). */
function pdfPageCount(bytes: Buffer): number {
  return bytes.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g)?.length ?? 0;
}

describe("GET /api/pdf/[slug]", () => {
  it("returns 401 when signed out", async () => {
    mockedUser.mockResolvedValue(null);
    const z = await zine(pro.id, [(await photo(pro.id)).id]);
    const res = await get(z.slug);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("returns 403 for a Free creator, even on their own zine", async () => {
    mockedUser.mockResolvedValue(free);
    const z = await zine(free.id, [(await photo(free.id)).id]);
    const res = await get(z.slug);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "PRO_REQUIRED" });
  });

  it("returns 404 for an unknown slug", async () => {
    expect((await get(`missing-${randomUUID()}`)).status).toBe(404);
  });

  it("returns 404 for the owner's unpublished zine", async () => {
    const z = await zine(pro.id, [(await photo(pro.id)).id], { published: false });
    expect((await get(z.slug)).status).toBe(404);
  });

  it("returns 404 for another creator's published zine, so exports are owner-only", async () => {
    const z = await zine(otherPro.id, [(await photo(otherPro.id)).id]);
    const res = await get(z.slug);
    expect(res.status).toBe(404);
  });

  it("asks the owner to choose a style first, rather than guessing one (DIG-64)", async () => {
    const z = await zine(pro.id, [(await photo(pro.id)).id], { settings: null });
    const res = await get(z.slug);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "STYLE_REQUIRED", error: expect.stringMatching(/template and paper size/i) });
  });

  it("streams a PDF to the Pro owner: a cover plus one page per zine page", async () => {
    const z = await zine(pro.id, [(await photo(pro.id)).id, (await photo(pro.id)).id]);
    const res = await get(z.slug);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="${z.slug}.pdf"`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdfPageCount(bytes)).toBe(3);
  });

  it("exports a processed photo from its AVIF copy, after the original is deleted (DIG-26)", async () => {
    const asset = await photo(pro.id);
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "processing" } });
    await processAsset(asset.id);
    const processed = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(processed.storageKey).toMatch(/\/full\.avif$/);

    const res = await get((await zine(pro.id, [asset.id])).slug);
    expect(res.status).toBe(200);
    // A cover plus the photo page: the page would be left out if the image could not be read.
    expect(pdfPageCount(Buffer.from(await res.arrayBuffer()))).toBe(2);
  });

  it("prints an edited photo with its crop and frame (DIG-33)", async () => {
    // The fixture photo is 40×50. A 1:1 crop is 40×40; a Polaroid frame adds 2 px on three
    // sides (5% of 40) and 8 px at the bottom (20%), so the printed image is 44×50.
    const edited = await photo(pro.id);
    await prisma.mediaAsset.update({
      where: { id: edited.id },
      data: {
        width: 40,
        height: 50,
        edit: { ratio: "1:1", zoom: 1, x: 0.5, y: 0.5, frame: "polaroid", cardSize: "normal" },
      },
    });
    const res = await get((await zine(pro.id, [edited.id])).slug);
    expect(res.status).toBe(200);
    const pdf = Buffer.from(await res.arrayBuffer()).toString("latin1");
    expect(pdf).toMatch(/\/Width 44\b/);
    expect(pdf).toMatch(/\/Height 50\b/);
  });

  it("prints an unedited photo whole, as before", async () => {
    const res = await get((await zine(pro.id, [(await photo(pro.id)).id])).slug);
    const pdf = Buffer.from(await res.arrayBuffer()).toString("latin1");
    expect(pdf).toMatch(/\/Width 40\b/);
    expect(pdf).toMatch(/\/Height 50\b/);
  });

  it("prints a large processed photo from its 1600 px copy, not the full-resolution one (DIG-41)", async () => {
    const storageKey = `users/${pro.id}/${randomUUID()}.jpg`;
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#204060" } }).jpeg().toBuffer();
    await writeLocalObject(storageKey, big, "image/jpeg");
    const asset = await prisma.mediaAsset.create({
      data: { ownerId: pro.id, boardId: await defaultBoardId(pro.id), storageKey, publicUrl: `/api/media/${storageKey}`, status: "processing" },
    });
    await processAsset(asset.id);
    const res = await get((await zine(pro.id, [asset.id])).slug);
    expect(res.status).toBe(200);
    const pdf = Buffer.from(await res.arrayBuffer()).toString("latin1");
    expect(pdf).toMatch(/\/Width 1600\b/);
    expect(pdf).not.toMatch(/\/Width 3000\b/);
  });

  it("renders a page whose photo carries a Fujifilm recipe", async () => {
    const withRecipe = await photo(pro.id);
    await prisma.mediaAsset.update({
      where: { id: withRecipe.id },
      data: {
        kind: "recipe",
        recipe: {
          name: "Kodachrome 64",
          filmSimulation: "Classic Chrome",
          whiteBalance: { mode: "Daylight", red: 2, blue: -5 },
          highlight: 0,
          shadow: 0.5,
        },
      },
    });
    const z = await zine(pro.id, [withRecipe.id]);
    const res = await get(z.slug);
    expect(res.status).toBe(200);
    expect(pdfPageCount(Buffer.from(await res.arrayBuffer()))).toBe(2);
  });

  it("never prints the owner's email when they have no display name", async () => {
    await prisma.user.update({ where: { id: pro.id }, data: { name: null } });
    try {
      const z = await zine(pro.id, [(await photo(pro.id)).id]);
      const bytes = Buffer.from(await (await get(z.slug)).arrayBuffer());
      const text = bytes.toString("latin1");
      const utf16 = Buffer.from(`﻿${pro.email}`, "utf16le").swap16().toString("hex");
      expect(text).not.toContain(pro.email);
      expect(text.toLowerCase()).not.toContain(utf16.slice(4));
    } finally {
      await prisma.user.update({ where: { id: pro.id }, data: { name: "API Test" } });
    }
  });

  it("skips pages whose photo belongs to someone else", async () => {
    const mine = await photo(pro.id);
    const theirs = await photo(otherPro.id);
    const z = await zine(pro.id, [mine.id, theirs.id]);
    const bytes = Buffer.from(await (await get(z.slug)).arrayBuffer());
    expect(pdfPageCount(bytes)).toBe(2);
  });

  it("still exports when a photo file is missing from storage, leaving that page out", async () => {
    const ok = await photo(pro.id);
    const gone = await photo(pro.id, { writeFile: false });
    const z = await zine(pro.id, [ok.id, gone.id]);
    const res = await get(z.slug);
    expect(res.status).toBe(200);
    expect(pdfPageCount(Buffer.from(await res.arrayBuffer()))).toBe(2);
  });

  // DIG-73: the one-sheet mini zine is free; the booklet stays Pro.
  describe("mini zine", () => {
    const mini = (slug: string, format = "mini") => GET(new Request(`http://test.local/api/pdf/${slug}?format=${format}`), params({ slug }));
    const photos = async (ownerId: string, n: number) => Promise.all(Array.from({ length: n }, () => photo(ownerId))).then((all) => all.map((p) => p.id));
    const sheet = async (res: Response) => readPdf(Buffer.from(await res.arrayBuffer()));
    const style = defaultPdfSettings("darkroom", "letter");

    it("is free, on one landscape sheet, while the booklet stays Pro", async () => {
      mockedUser.mockResolvedValue(free);
      const z = await zine(free.id, await photos(free.id, 4), { settings: style });
      const res = await mini(z.slug);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toContain(`${z.slug}-mini.pdf`);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      const pages = await sheet(res);
      expect(pages.map((p) => [p.width, p.height])).toEqual([[792, 612]]);
      expect(pages[0].text.replace(/\s/g, "")).toContain(`/z/${free.publicId}/${z.slug}`);
      for (const r of [await mini(z.slug, "booklet"), await get(z.slug)]) {
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({ code: "PRO_REQUIRED" });
      }
    });

    it("uses the stored format when none is asked for, and an asked-for one over it", async () => {
      const z = await zine(pro.id, await photos(pro.id, 4), { settings: { ...style, format: "mini" } });
      expect(await sheet(await get(z.slug))).toHaveLength(1);
      expect(await sheet(await mini(z.slug, "booklet"))).toHaveLength(5);
    });

    it("prints the chosen photos in the chosen order, or the first six", async () => {
      const ids = await photos(pro.id, 8);
      const all = await zine(pro.id, ids, { settings: style });
      const first = (await sheet(await mini(all.slug)))[0].text;
      for (const n of [1, 6]) expect(first).toContain(`Plate ${n}`);
      expect(first).not.toMatch(/Plate [78]/);
      const picked = await zine(pro.id, ids, { settings: { ...style, miniPhotos: [ids[7], ids[0], ids[6], ids[2]] } });
      const text = (await sheet(await mini(picked.slug)))[0].text;
      // The top row is drawn first, left to right: pages 5, 4, 3. Page 6 starts the bottom row.
      expect(text.match(/Plate \d/g)).toEqual(["Plate 7", "Plate 1", "Plate 8", "Plate 3"]);
    });

    it("skips chosen photos that have left the zine", async () => {
      const ids = await photos(pro.id, 5);
      const z = await zine(pro.id, ids.slice(0, 4), { settings: { ...style, miniPhotos: ids } });
      expect((await mini(z.slug)).status).toBe(200);
    });

    it("asks for four photos when there are fewer, or when fewer can be read", async () => {
      const ids = await photos(pro.id, 3);
      const gone = await photo(pro.id, { writeFile: false });
      for (const list of [ids, [...ids, gone.id]]) {
        const res = await mini((await zine(pro.id, list, { settings: style })).slug);
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: "MINI_PHOTOS_REQUIRED" });
      }
    });

    it("keeps the booklet's other checks", async () => {
      const ids = await photos(pro.id, 4);
      const z = await zine(pro.id, ids, { settings: style });
      expect((await mini(z.slug, "poster")).status).toBe(400);
      expect((await mini((await zine(pro.id, ids, { settings: null })).slug)).status).toBe(409);
      expect((await mini((await zine(pro.id, ids, { published: false, settings: style })).slug)).status).toBe(404);
      mockedUser.mockResolvedValue(otherPro);
      expect((await mini(z.slug)).status).toBe(404);
      mockedUser.mockResolvedValue(null);
      expect((await mini(z.slug)).status).toBe(401);
    });

    it("counts toward the same limit", async () => {
      mockedUser.mockResolvedValue(free);
      for (let i = 0; i < 10; i++) expect((await mini("missing")).status).toBe(404);
      expect((await mini("missing")).status).toBe(429);
    });
  });

  it("never fetches images from the request's Host header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gone = await photo(pro.id, { writeFile: false });
    const z = await zine(pro.id, [gone.id]);
    await GET(
      new Request(`http://attacker.example/api/pdf/${z.slug}`),
      params({ slug: z.slug })
    );
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).not.toContainEqual(expect.stringContaining("attacker.example"));
  });
});

describe("cover (DIG-126)", () => {
  const images = (content: string) => (content.match(/ Do\b/g) ?? []).length;
  const covered = (cover: PdfSettings["cover"], over: Partial<PdfSettings> = {}) => ({ ...defaultPdfSettings("darkroom", "a4"), cover, ...over });
  async function firstPage(assetIds: string[], settings: PdfSettings, format = "booklet") {
    const { slug } = await zine(pro.id, assetIds, { settings });
    const res = await GET(new Request(`http://test/api/pdf/${slug}?format=${format}`), params({ slug }));
    expect(res.status).toBe(200);
    return readPdf(Buffer.from(await res.arrayBuffer()))[0];
  }

  it("has no photo on Title only, and one on Full-page photo", async () => {
    const a = await photo(pro.id);
    expect(images((await firstPage([a.id], covered({ style: "title", photo: null }))).content)).toBe(0);
    expect(images((await firstPage([a.id], covered({ style: "full", photo: null }))).content)).toBe(1);
  });

  it("falls back to the first photo when the chosen one has left the zine or cannot be read", async () => {
    const a = await photo(pro.id);
    const lost = await photo(pro.id, { writeFile: false });
    expect(images((await firstPage([a.id], covered({ style: "full", photo: "gone" }))).content)).toBe(1);
    expect(images((await firstPage([a.id, lost.id], covered({ style: "full", photo: lost.id }))).content)).toBe(1);
  });

  it("puts a photo on the mini zine's cover that is not one of its inside photos", async () => {
    const all = await Promise.all(Array.from({ length: 7 }, () => photo(pro.id)));
    const ids = all.map((a) => a.id);
    const inside = { miniPhotos: ids.slice(0, 6) };
    expect(images((await firstPage(ids, covered({ style: "title", photo: null }, inside), "mini")).content)).toBe(6);
    expect(images((await firstPage(ids, covered({ style: "full", photo: ids[6] }, inside), "mini")).content)).toBe(7);
  });

  it("never prints another creator's photo, even if the settings name one", async () => {
    const mine = await photo(pro.id);
    const theirs = await photo(otherPro.id);
    const page = await firstPage([mine.id, theirs.id], covered({ style: "full", photo: theirs.id }));
    expect(images(page.content)).toBe(1);
  });
});
