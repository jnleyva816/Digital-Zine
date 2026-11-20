import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPublicZine } from "@/lib/public-zine";
import { createAsset, createTestUser, defaultBoardId, deleteTestUser } from "./helpers";

let owner: Awaited<ReturnType<typeof createTestUser>>;

beforeAll(async () => {
  owner = await createTestUser();
});

afterAll(async () => {
  await deleteTestUser(owner.id);
  await prisma.$disconnect();
});

describe("getPublicZine photo edits (DIG-33)", () => {
  it("gives readers each photo's crop and frame with its size", async () => {
    const edit = { ratio: "1:1", zoom: 1.2, x: 0.4, y: 0.5, frame: "black", cardSize: "normal" };
    const photo = await createAsset(owner.id, 0, "edited.jpg");
    await prisma.mediaAsset.update({ where: { id: photo.id }, data: { edit, width: 600, height: 400 } });
    const slug = `edited-${randomUUID().slice(0, 8)}`;
    await prisma.zine.create({
      data: {
        ownerId: owner.id,
        boardId: await defaultBoardId(owner.id),
        title: "Edited",
        slug,
        published: true,
        publishedAt: new Date(),
        pages: { create: [{ pageNumber: 1, content: { assetId: photo.id, caption: "" } }] },
      },
    });
    const zine = await getPublicZine(slug);
    expect(zine?.pages[0]).toMatchObject({ edit, dims: { width: 600, height: 400 } });
  });
});

describe("getPublicZine (DIG-34)", () => {
  it("gives readers each photo's in-app name, and null rather than the file name when it has none", async () => {
    const named = await createAsset(owner.id, 0, "DSCF1368.JPG");
    await prisma.mediaAsset.update({ where: { id: named.id }, data: { name: "Harbor at dusk" } });
    const unnamed = await createAsset(owner.id, 1, "DSCF1369.JPG");
    const slug = `named-${randomUUID().slice(0, 8)}`;
    await prisma.zine.create({
      data: {
        ownerId: owner.id,
        boardId: await defaultBoardId(owner.id),
        title: "Names",
        slug,
        published: true,
        publishedAt: new Date(),
        pages: {
          create: [
            { pageNumber: 1, content: { assetId: named.id, caption: "" } },
            { pageNumber: 2, content: { assetId: unnamed.id, caption: "" } },
          ],
        },
      },
    });

    const zine = await getPublicZine(slug);
    expect(zine?.pages.map((p) => p.name)).toEqual(["Harbor at dusk", null]);
  });
});

describe("getPublicZine and unprocessed photos (DIG-38)", () => {
  it("skips pages whose photo is still processing or failed, so readers never get the original", async () => {
    const ready = await createAsset(owner.id, 0, "ready.jpg");
    const failed = await createAsset(owner.id, 1, "failed.jpg");
    const processing = await createAsset(owner.id, 2, "processing.jpg");
    await prisma.mediaAsset.update({ where: { id: failed.id }, data: { status: "failed" } });
    await prisma.mediaAsset.update({ where: { id: processing.id }, data: { status: "processing" } });
    const slug = `unprocessed-${randomUUID().slice(0, 8)}`;
    await prisma.zine.create({
      data: {
        ownerId: owner.id,
        boardId: await defaultBoardId(owner.id),
        title: "Mixed",
        slug,
        published: true,
        publishedAt: new Date(),
        pages: {
          create: [
            { pageNumber: 1, content: { assetId: failed.id, caption: "" } },
            { pageNumber: 2, content: { assetId: processing.id, caption: "" } },
            { pageNumber: 3, content: { assetId: ready.id, caption: "" } },
          ],
        },
      },
    });
    const zine = await getPublicZine(slug);
    expect(zine?.pages.map((p) => p.imageUrl)).toEqual([ready.publicUrl]);
    expect(zine?.pages[0].pageNumber).toBe(1);
    const json = JSON.stringify(zine);
    expect(json).not.toContain(failed.storageKey);
    expect(json).not.toContain(processing.storageKey);
  });
});

