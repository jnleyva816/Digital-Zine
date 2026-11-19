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
