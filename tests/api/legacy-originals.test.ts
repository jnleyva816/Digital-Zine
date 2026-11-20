import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { stripLegacyOriginals } from "@/lib/media/legacy-originals";
import { publicZineTag } from "@/lib/public-zine";
import { readLocalObject, writeLocalObject } from "@/lib/storage/local";
import { createAsset, createTestUser, defaultBoardId, deleteTestUser } from "./helpers";

let me: Awaited<ReturnType<typeof createTestUser>>;
let dir: string;

beforeAll(async () => {
  me = await createTestUser();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-legacy-"));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await deleteTestUser(me.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  await prisma.zine.deleteMany({ where: { ownerId: me.id } });
  await prisma.mediaAsset.deleteMany({ where: { ownerId: me.id } });
  vi.mocked(revalidateTag).mockClear();
});

const gpsJpeg = () =>
  sharp({ create: { width: 60, height: 40, channels: 3, background: "#aa5533" } })
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "27/1 57/1 0/1" } })
    .jpeg()
    .toBuffer();

/** A photo from before the image pipeline: ready, served from its original JPEG. */
async function legacyPhoto(name = "dscf1368.jpg") {
  const asset = await createAsset(me.id, 0, name);
  await writeLocalObject(asset.storageKey, await gpsJpeg(), "image/jpeg");
  return asset;
}

describe("stripping metadata from pre-pipeline originals (DIG-38)", () => {
  it("moves each one to a new address without EXIF, deletes the old file, and refreshes zines that show it", async () => {
    const old = await legacyPhoto();
    const zine = await prisma.zine.create({
      data: {
        ownerId: me.id,
        boardId: await defaultBoardId(me.id),
        title: "Old",
        slug: `old-${old.id}`,
        published: true,
        publishedAt: new Date(),
        pages: { create: [{ pageNumber: 1, content: { assetId: old.id, caption: "" } }] },
      },
    });

    expect(await stripLegacyOriginals()).toEqual({ cleaned: 1 });

    const updated = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: old.id } });
    expect(updated.storageKey).not.toBe(old.storageKey);
    expect(updated.storageKey).toMatch(/\.clean\.jpg$/);
    expect(updated.publicUrl).toContain(updated.storageKey);
    expect(await readLocalObject(old.storageKey)).toBeNull();
    const stored = await readLocalObject(updated.storageKey);
    expect((await sharp(stored!.bytes).metadata()).exif).toBeUndefined();
    expect(updated.sizeBytes).toBe(stored!.bytes.length);
    // The EXIF the app keeps for card backs is untouched.
    expect(updated.exif).toEqual(old.exif);
    expect(vi.mocked(revalidateTag).mock.calls.map(([t]) => t)).toContain(publicZineTag(me.publicId, zine.slug));
  });

  it("leaves processed AVIF photos, and photos still processing or failed, alone; and is safe to run twice", async () => {
    await legacyPhoto("a.jpg");
    const avif = await createAsset(me.id, 1, "b.jpg");
    await prisma.mediaAsset.update({
      where: { id: avif.id },
      data: { storageKey: `users/${me.id}/up/full.avif`, publicUrl: `/api/media/users/${me.id}/up/full.avif` },
    });
    const processing = await legacyPhoto("c.jpg");
    await prisma.mediaAsset.update({ where: { id: processing.id }, data: { status: "processing" } });

    expect(await stripLegacyOriginals()).toEqual({ cleaned: 1 });
    expect(await stripLegacyOriginals()).toEqual({ cleaned: 0 });
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: processing.id } })).storageKey).toBe(processing.storageKey);
  });

  it("skips a photo whose file is missing, and keeps going", async () => {
    await createAsset(me.id, 0, "gone.jpg");
    await legacyPhoto("here.jpg");
    expect(await stripLegacyOriginals()).toEqual({ cleaned: 1 });
  });
});
