import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPublicZine } from "@/lib/zine/public-zine";
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
    const zine = await getPublicZine(owner.publicId, slug);
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

    const zine = await getPublicZine(owner.publicId, slug);
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
    const zine = await getPublicZine(owner.publicId, slug);
    expect(zine?.pages.map((p) => p.imageUrl)).toEqual([ready.publicUrl]);
    expect(zine?.pages[0].pageNumber).toBe(1);
    const json = JSON.stringify(zine);
    expect(json).not.toContain(failed.storageKey);
    expect(json).not.toContain(processing.storageKey);
  });
});

describe("getPublicZine addresses (DIG-102)", () => {
  let other: Awaited<ReturnType<typeof createTestUser>>;
  beforeAll(async () => {
    other = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUser(other.id);
  });

  async function publish(user: typeof owner, slug: string, title: string) {
    const photo = await createAsset(user.id, 0, `${title}.jpg`);
    await prisma.mediaAsset.update({ where: { id: photo.id }, data: { status: "ready" } });
    return prisma.zine.create({
      data: {
        ownerId: user.id,
        boardId: await defaultBoardId(user.id),
        title,
        slug,
        published: true,
        publishedAt: new Date(),
        pages: { create: [{ pageNumber: 1, content: { assetId: photo.id, caption: "" } }] },
      },
    });
  }

  it("gives each user a short, lowercase public ID of their own", () => {
    expect(owner.publicId).toMatch(/^[a-z0-9]{6,12}$/);
    expect(other.publicId).toMatch(/^[a-z0-9]{6,12}$/);
    expect(other.publicId).not.toBe(owner.publicId);
  });

  it("lets two creators publish the same slug, each reached through their own ID", async () => {
    const slug = `shared-${randomUUID().slice(0, 8)}`;
    await publish(owner, slug, "Mine");
    await publish(other, slug, "Theirs");
    expect((await getPublicZine(owner.publicId, slug))?.title).toBe("Mine");
    expect((await getPublicZine(other.publicId, slug))?.title).toBe("Theirs");
  });

  it("does not find a zine under another creator's ID, an unknown ID, or an unpublished slug", async () => {
    const slug = `only-mine-${randomUUID().slice(0, 8)}`;
    await publish(owner, slug, "Mine");
    expect(await getPublicZine(other.publicId, slug)).toBeNull();
    expect(await getPublicZine("nobodyhere", slug)).toBeNull();
    const draft = `draft-${randomUUID().slice(0, 8)}`;
    await prisma.zine.create({ data: { ownerId: owner.id, boardId: await defaultBoardId(owner.id), title: "Draft", slug: draft } });
    expect(await getPublicZine(owner.publicId, draft)).toBeNull();
  });

  it("tells readers the creator part of the address, for canonical and share links", async () => {
    const slug = `addr-${randomUUID().slice(0, 8)}`;
    await publish(owner, slug, "Addr");
    expect((await getPublicZine(owner.publicId, slug))?.owner).toBe(owner.publicId);
  });
});
