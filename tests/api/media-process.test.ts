import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { processAsset } from "@/lib/media/process";
import { writeLocalObject } from "@/lib/storage/local";
import { createAsset, createTestUser, deleteTestUser } from "./helpers";

let me: Awaited<ReturnType<typeof createTestUser>>;
let dir: string;

beforeAll(async () => {
  me = await createTestUser();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-process-"));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await deleteTestUser(me.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  await prisma.mediaAsset.deleteMany({ where: { ownerId: me.id } });
});

const exists = (key: string) =>
  fs.access(path.join(dir, key)).then(
    () => true,
    () => false
  );

/** A board photo still waiting for the worker, with `bytes` uploaded under its key. */
async function uploaded(bytes: Buffer, name = "dscf0001.jpg") {
  const asset = await createAsset(me.id, 0, name);
  await writeLocalObject(asset.storageKey, bytes, "image/jpeg");
  return prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { status: "processing", sizeBytes: bytes.length },
  });
}

const photo = (width = 3000, height = 2000) =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } } })
    .withExif({ IFD0: { Make: "FUJIFILM", Model: "X-T5" } })
    .jpeg({ quality: 95 })
    .toBuffer();

describe("processAsset (DIG-26)", () => {
  it("stores the AVIF copies, points the photo at the full-resolution one, and deletes the original", async () => {
    const asset = await uploaded(await photo());
    const base = asset.storageKey.replace(/\.jpg$/, "");

    await processAsset(asset.id);

    const done = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(done).toMatchObject({
      status: "ready",
      storageKey: `${base}/full.avif`,
      publicUrl: `/api/media/${base}/full.avif`,
      mimeType: "image/avif",
      width: 3000,
      height: 2000,
      processingError: null,
    });
    expect(done.blurDataUrl).toMatch(/^data:image\/webp;base64,/);

    const keys = ["full.avif", "w480.avif", "w960.avif", "w1600.avif", "og.jpg"].map((f) => `${base}/${f}`);
    for (const key of keys) expect(await exists(key)).toBe(true);
    expect(await exists(asset.storageKey)).toBe(false);

    // The quota now counts what is stored: the copies, not the deleted original.
    const sizes = await Promise.all(keys.map((k) => fs.stat(path.join(dir, k)).then((s) => s.size)));
    expect(done.sizeBytes).toBe(sizes.reduce((a, b) => a + b, 0));
  });

  it("marks the photo failed, with a reason, when the upload is missing", async () => {
    const asset = await createAsset(me.id, 0);
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "processing" } });
    await processAsset(asset.id);
    expect(await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({
      status: "failed",
      processingError: "The uploaded file is missing. Delete this photo and upload it again.",
    });
  });

  it("marks the photo failed, and keeps the upload, when the file is not a readable image", async () => {
    const asset = await uploaded(Buffer.from("definitely not a jpeg"));
    await processAsset(asset.id);
    expect(await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({
      status: "failed",
      processingError: "This file could not be read as an image.",
      storageKey: asset.storageKey,
    });
    expect(await exists(asset.storageKey)).toBe(true);
  });

  it("leaves a photo alone unless it is waiting to be processed", async () => {
    const asset = await createAsset(me.id, 0);
    await processAsset(asset.id);
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe("ready");
    await expect(processAsset("no-such-asset")).resolves.toBeUndefined();
  });

  it("removes the copies again if the photo was deleted while it was processing", async () => {
    const asset = await uploaded(await photo(1200, 800));
    const base = asset.storageKey.replace(/\.jpg$/, "");
    const original = prisma.mediaAsset.updateMany.bind(prisma.mediaAsset);
    // Delete the row just before the worker saves its result.
    const spy = vi.spyOn(prisma.mediaAsset, "updateMany").mockImplementationOnce(((args: never) =>
      prisma.mediaAsset.delete({ where: { id: asset.id } }).then(() => original(args))) as never);
    await processAsset(asset.id);
    spy.mockRestore();
    expect(await exists(`${base}/full.avif`)).toBe(false);
    expect(await exists(`${base}/w480.avif`)).toBe(false);
  });
});
