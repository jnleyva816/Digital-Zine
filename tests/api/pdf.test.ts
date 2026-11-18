import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { writeLocalObject } from "@/lib/storage/local";
import { GET } from "@/app/api/pdf/[slug]/route";
import { createTestUser, deleteTestUser, params } from "./helpers";

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
    data: { ownerId, storageKey, publicUrl: `/api/media/${storageKey}`, exif: { iso: 400 } },
  });
}

async function zine(ownerId: string, assetIds: string[], { published = true } = {}) {
  return prisma.zine.create({
    data: {
      ownerId,
      title: "Brine & Light",
      slug: `pdf-${randomUUID().slice(0, 8)}`,
      published,
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
