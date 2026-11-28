import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { publicZinePath } from "../../src/lib/zine/public-zine-path";
import { createUserWithPhotos, defaultBoardId, deleteUser, signIn, testDb } from "./helpers";

/** DIG-102: a zine's public address includes its creator, so slugs only need to be unique per creator. */

test.afterAll(async () => {
  await testDb.$disconnect();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

async function creator() {
  const data = await createUserWithPhotos();
  cleanup.push(data.user.id);
  return data;
}

async function publish(userId: string, assetId: string, slug: string, title: string, createdAt?: Date) {
  return testDb.zine.create({
    data: {
      ownerId: userId,
      boardId: await defaultBoardId(userId),
      title,
      slug,
      published: true,
      publishedAt: new Date(),
      ...(createdAt ? { createdAt } : {}),
      pages: { create: [{ pageNumber: 1, content: { assetId, caption: "" } }] },
    },
  });
}

test("two creators can publish the same slug, and each address shows its own zine", async ({ page }) => {
  const a = await creator();
  const b = await creator();
  const slug = `golden-hour-${randomUUID().slice(0, 6)}`;
  await publish(a.user.id, a.assets[0].id, slug, "Ada's Golden Hour");
  await publish(b.user.id, b.assets[0].id, slug, "Ben's Golden Hour");

  await page.goto(publicZinePath(a.user.publicId, slug));
  await expect(page.getByRole("heading", { level: 1, name: "Ada's Golden Hour" })).toBeVisible();
  await page.goto(publicZinePath(b.user.publicId, slug));
  await expect(page.getByRole("heading", { level: 1, name: "Ben's Golden Hour" })).toBeVisible();
});

test("a slug under the wrong creator, or an unknown creator, is a 404", async ({ request }) => {
  const a = await creator();
  const b = await creator();
  const slug = `only-ada-${randomUUID().slice(0, 6)}`;
  await publish(a.user.id, a.assets[0].id, slug, "Only Ada");

  expect((await request.get(publicZinePath(a.user.publicId, slug))).status()).toBe(200);
  expect((await request.get(publicZinePath(b.user.publicId, slug))).status()).toBe(404);
  expect((await request.get(publicZinePath("nobodyhere", slug))).status()).toBe(404);
});

test("the page's share and canonical links carry the creator", async ({ request, baseURL }) => {
  const a = await creator();
  const slug = `share-${randomUUID().slice(0, 6)}`;
  await publish(a.user.id, a.assets[0].id, slug, "Share Me");
  const path = publicZinePath(a.user.publicId, slug);
  const html = await (await request.get(path)).text();
  expect(html).toContain(`<link rel="canonical" href="${baseURL}${path}"`);
  expect(html).toContain(`content="${baseURL}${path}"`);
});

test.describe("links shared before creators were in the address", () => {
  test("/z/<slug> redirects for good to the zine's new address", async ({ request, page }) => {
    const a = await creator();
    const slug = `old-link-${randomUUID().slice(0, 6)}`;
    await publish(a.user.id, a.assets[0].id, slug, "Old Link");

    const res = await request.get(`/z/${slug}`, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(new URL(res.headers().location, "http://x").pathname).toBe(publicZinePath(a.user.publicId, slug));

    await page.goto(`/z/${slug}`);
    await expect(page).toHaveURL(new RegExp(`${publicZinePath(a.user.publicId, slug)}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Old Link" })).toBeVisible();
  });

  test("a page fragment survives the redirect, so an old full-screen link still opens", async ({ page }) => {
    const a = await creator();
    const slug = `old-frag-${randomUUID().slice(0, 6)}`;
    await publish(a.user.id, a.assets[0].id, slug, "Fragment");
    await page.goto(`/z/${slug}#page-1`);
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("when two creators share the slug, the old link goes to the older zine", async ({ request }) => {
    const older = await creator();
    const newer = await creator();
    const slug = `contested-${randomUUID().slice(0, 6)}`;
    await publish(newer.user.id, newer.assets[0].id, slug, "Newer", new Date("2026-11-20T10:00:00Z"));
    await publish(older.user.id, older.assets[0].id, slug, "Older", new Date("2026-11-01T10:00:00Z"));
    const res = await request.get(`/z/${slug}`, { maxRedirects: 0 });
    expect(new URL(res.headers().location, "http://x").pathname).toBe(publicZinePath(older.user.publicId, slug));
  });

  test("an unknown or unpublished slug is still a 404", async ({ request }) => {
    const a = await creator();
    expect((await request.get(`/z/no-such-${randomUUID().slice(0, 6)}`)).status()).toBe(404);
    const slug = `draft-${randomUUID().slice(0, 6)}`;
    await testDb.zine.create({ data: { ownerId: a.user.id, boardId: await defaultBoardId(a.user.id), title: "Draft", slug } });
    expect((await request.get(`/z/${slug}`)).status()).toBe(404);
  });
});

test("the studio's link to the published zine uses the new address", async ({ page }) => {
  const a = await creator();
  const slug = `header-${randomUUID().slice(0, 6)}`;
  await publish(a.user.id, a.assets[0].id, slug, "Header Link");
  await signIn(page, a.user.email, a.user.password);
  await page.goto("/billing");
  await page.getByRole("button", { name: "Account menu" }).click();
  const link = page.getByRole("link", { name: "Public Viewer" });
  await expect(link).toHaveAttribute("href", publicZinePath(a.user.publicId, slug));
});
