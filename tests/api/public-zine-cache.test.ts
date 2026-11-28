import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { POST as CREATE_ZINE } from "@/app/api/zines/route";
import { DELETE as DELETE_ZINE, PATCH as PATCH_ZINE } from "@/app/api/zines/[id]/route";
import { PATCH as PATCH_ASSET } from "@/app/api/assets/[id]/route";
import { PATCH as PATCH_RECIPE } from "@/app/api/recipes/[id]/route";
import { publicZineTag } from "@/lib/zine/public-zine";
import { createAsset, createSavedRecipe, createTestUser, defaultBoardId, deleteTestUser, jsonRequest, params, resetRateLimits } from "./helpers";

vi.mock("@/lib/auth/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);
const revalidated = vi.mocked(revalidateTag);

let me: Awaited<ReturnType<typeof createTestUser>>;

beforeAll(async () => {
  me = await createTestUser();
});

afterAll(async () => {
  await deleteTestUser(me.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetRateLimits();
  mockedUser.mockResolvedValue({ ...me, tier: "pro" });
  await prisma.zine.deleteMany({ where: { ownerId: me.id } });
  await prisma.mediaAsset.deleteMany({ where: { ownerId: me.id } });
  revalidated.mockClear();
});

async function publishedZineWith(assetId: string) {
  return prisma.zine.create({
    data: {
      ownerId: me.id,
      boardId: await defaultBoardId(me.id),
      title: "Cached",
      slug: `cached-${randomUUID().slice(0, 8)}`,
      published: true,
      publishedAt: new Date(),
      pages: { create: [{ pageNumber: 1, content: { assetId, caption: "" } }] },
    },
  });
}

const tags = () => revalidated.mock.calls.map(([tag]) => tag);

describe("public zine cache invalidation (DIG-27)", () => {
  it("names each zine's cache entry by its creator and slug (DIG-102)", () => {
    expect(publicZineTag("ab12cd34", "harbor-notes")).toBe("public-zine:ab12cd34/harbor-notes");
    // The same slug under two creators is two cache entries.
    expect(publicZineTag("ab12cd34", "harbor-notes")).not.toBe(publicZineTag("ef56ab78", "harbor-notes"));
  });

  it("refreshes a zine when it is edited, published, or unpublished", async () => {
    const photo = await createAsset(me.id, 0);
    const zine = await publishedZineWith(photo.id);
    for (const body of [{ title: "New title" }, { published: false }, { published: true }]) {
      revalidated.mockClear();
      await PATCH_ZINE(jsonRequest("/", "PATCH", body), params({ id: zine.id }));
      expect(tags(), JSON.stringify(body)).toContain(publicZineTag(me.publicId, zine.slug));
    }
  });

  it("refreshes both the old and the new address when the slug changes", async () => {
    const photo = await createAsset(me.id, 0);
    const zine = await prisma.zine.create({
      data: { ownerId: me.id, boardId: await defaultBoardId(me.id), title: "Draft", slug: `draft-${randomUUID().slice(0, 8)}` },
    });
    await PATCH_ZINE(jsonRequest("/", "PATCH", { slug: "brand-new-slug-dig27", pages: [{ assetId: photo.id }] }), params({ id: zine.id }));
    expect(tags()).toEqual(expect.arrayContaining([publicZineTag(me.publicId, zine.slug), publicZineTag(me.publicId, "brand-new-slug-dig27")]));
  });

  it("refreshes a zine when it is deleted, so its address 404s", async () => {
    const photo = await createAsset(me.id, 0);
    const zine = await publishedZineWith(photo.id);
    await DELETE_ZINE(jsonRequest("/", "DELETE"), params({ id: zine.id }));
    expect(tags()).toContain(publicZineTag(me.publicId, zine.slug));
  });

  it("refreshes a new zine's address, in case a 404 was cached there", async () => {
    const res = await CREATE_ZINE(jsonRequest("/api/zines", "POST", { title: "Fresh Issue" }));
    const { zine } = (await res.json()) as { zine: { slug: string } };
    expect(tags()).toContain(publicZineTag(me.publicId, zine.slug));
  });

  it("refreshes every zine that uses a photo when the photo's name, edit, or recipe changes", async () => {
    const photo = await createAsset(me.id, 0);
    const unrelated = await createAsset(me.id, 1);
    const a = await publishedZineWith(photo.id);
    const b = await publishedZineWith(photo.id);
    const other = await publishedZineWith(unrelated.id);
    for (const body of [
      { name: "Harbor" },
      { edit: { ratio: "1:1", zoom: 1, x: 0.5, y: 0.5, frame: "black", cardSize: "normal" } },
      { kind: "recipe", recipe: { name: "Chrome", filmSimulation: "Classic Chrome" } },
    ]) {
      revalidated.mockClear();
      await PATCH_ASSET(jsonRequest("/", "PATCH", body), params({ id: photo.id }));
      expect(tags(), JSON.stringify(body)).toEqual(expect.arrayContaining([publicZineTag(me.publicId, a.slug), publicZineTag(me.publicId, b.slug)]));
      expect(tags()).not.toContain(publicZineTag(me.publicId, other.slug));
    }
  });

  it("refreshes zines whose photos use a saved recipe when that recipe is edited", async () => {
    const saved = await createSavedRecipe(me.id, `Kodachrome ${randomUUID().slice(0, 4)}`);
    const photo = await createAsset(me.id, 0);
    await prisma.mediaAsset.update({ where: { id: photo.id }, data: { recipeId: saved.id } });
    const zine = await publishedZineWith(photo.id);
    await PATCH_RECIPE(
      jsonRequest("/", "PATCH", { recipe: { name: saved.name, filmSimulation: "Acros" } }),
      params({ id: saved.id })
    );
    expect(tags()).toContain(publicZineTag(me.publicId, zine.slug));
    await prisma.recipe.delete({ where: { id: saved.id } });
  });
});
