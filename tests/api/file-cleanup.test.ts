import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { DELETE } from "@/app/api/assets/[id]/route";
import { processAsset } from "@/lib/media/process";
import { deleteAccount, storedKeysFor } from "@/lib/storage/cleanup";
import { LocalStorageDriver, writeLocalObject } from "@/lib/storage/local";
import sharp from "sharp";
import { createAsset, createTestUser, createZineUsing, deleteTestUser, jsonRequest, params, resetRateLimits } from "./helpers";

vi.mock("@/lib/auth/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

let me: Awaited<ReturnType<typeof createTestUser>>;
let dir: string;

beforeAll(async () => {
  me = await createTestUser();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-cleanup-"));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await deleteTestUser(me.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetRateLimits();
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  mockedUser.mockResolvedValue(me);
  await prisma.zine.deleteMany({ where: { ownerId: me.id } });
  await prisma.mediaAsset.deleteMany({ where: { ownerId: me.id } });
});

const exists = (key: string) =>
  fs.access(path.join(dir, key)).then(
    () => true,
    () => false
  );
const remove = (id: string) => DELETE(jsonRequest("/", "DELETE"), params({ id }));

/** A processed photo: its AVIF copies and share image, and no original. */
async function processedPhoto() {
  const asset = await createAsset(me.id, 0, "harbor.jpg");
  const base = asset.storageKey.replace(/\.jpg$/, "");
  const keys = [`${base}/full.avif`, `${base}/w480.avif`, `${base}/w960.avif`, `${base}/w1600.avif`, `${base}/og.jpg`];
  for (const key of keys) await writeLocalObject(key, Buffer.from("x"), key.endsWith(".jpg") ? "image/jpeg" : "image/avif");
  await prisma.mediaAsset.update({ where: { id: asset.id }, data: { storageKey: keys[0], publicUrl: `/api/media/${keys[0]}` } });
  return { asset, keys };
}

describe("deleting stored files (DIG-40)", () => {
  it("knows every file a photo has: its AVIF copies and share image, or its original", () => {
    expect(storedKeysFor("users/u/1-a-harbor/full.avif").sort()).toEqual(
      ["users/u/1-a-harbor/full.avif", "users/u/1-a-harbor/og.jpg", "users/u/1-a-harbor/w1600.avif", "users/u/1-a-harbor/w480.avif", "users/u/1-a-harbor/w960.avif"].sort()
    );
    expect(storedKeysFor("users/u/1-a-harbor.jpg")).toEqual(expect.arrayContaining(["users/u/1-a-harbor.jpg", "users/u/1-a-harbor/full.avif"]));
  });

  it("removes all of a processed photo's files when it is deleted", async () => {
    const { asset, keys } = await processedPhoto();
    expect((await remove(asset.id)).status).toBe(200);
    for (const key of keys) expect(await exists(key), key).toBe(false);
  });

  it("removes an older photo's original when it is deleted", async () => {
    const asset = await createAsset(me.id, 0, "old.jpg");
    await writeLocalObject(asset.storageKey, Buffer.from("x"), "image/jpeg");
    expect((await remove(asset.id)).status).toBe(200);
    expect(await exists(asset.storageKey)).toBe(false);
  });

  it("keeps the files of a photo a zine still uses (the delete is refused)", async () => {
    const { asset, keys } = await processedPhoto();
    await createZineUsing(me.id, asset.id);
    expect((await remove(asset.id)).status).toBe(409);
    expect(await exists(keys[0])).toBe(true);
  });

  it("still deletes the photo when a file cannot be removed, and logs it", async () => {
    const { asset } = await processedPhoto();
    const failing = vi.spyOn(LocalStorageDriver.prototype, "deleteObject").mockRejectedValue(new Error("disk says no"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await remove(asset.id)).status).toBe(200);
    expect(await prisma.mediaAsset.count({ where: { id: asset.id } })).toBe(0);
    expect(logged).toHaveBeenCalled();
    failing.mockRestore();
  });

  it("leaves no files when a photo is deleted while the worker is processing it", async () => {
    const asset = await createAsset(me.id, 0, "busy.jpg");
    const jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#123456" } }).jpeg().toBuffer();
    await writeLocalObject(asset.storageKey, jpeg, "image/jpeg");
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "processing" } });
    // The row disappears between the worker reading it and saving the result.
    const original = prisma.mediaAsset.updateMany.bind(prisma.mediaAsset);
    vi.spyOn(prisma.mediaAsset, "updateMany").mockImplementationOnce((async (args: Parameters<typeof original>[0]) => {
      await prisma.mediaAsset.delete({ where: { id: asset.id } });
      return original(args);
    }) as never);
    await processAsset(asset.id);
    for (const key of storedKeysFor(asset.storageKey)) expect(await exists(key), key).toBe(false);
  });

  it("removes every file in an account's folder when the account is deleted, and nobody else's", async () => {
    const other = await createTestUser();
    try {
      await writeLocalObject(`users/${me.id}/a/full.avif`, Buffer.from("x"), "image/avif");
      await writeLocalObject(`users/${me.id}/b.jpg`, Buffer.from("x"), "image/jpeg");
      await writeLocalObject(`users/${other.id}/c.jpg`, Buffer.from("x"), "image/jpeg");
      const doomed = await createTestUser();
      await writeLocalObject(`users/${doomed.id}/d.jpg`, Buffer.from("x"), "image/jpeg");
      await deleteAccount(doomed.id);
      expect(await exists(`users/${doomed.id}/d.jpg`)).toBe(false);
      expect(await prisma.user.count({ where: { id: doomed.id } })).toBe(0);
      expect(await exists(`users/${other.id}/c.jpg`)).toBe(true);
      expect(await exists(`users/${me.id}/b.jpg`)).toBe(true);
    } finally {
      await deleteTestUser(other.id);
    }
  });
});
