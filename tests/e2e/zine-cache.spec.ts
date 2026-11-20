import { expect, test } from "@playwright/test";
import { createUserWithPhotos, defaultBoardId, deleteUser, signIn, testDb } from "./helpers";
import { publicZinePath } from "../../src/lib/public-zine-path";

/** DIG-27: public zine pages come from the cache and refresh as soon as the creator changes them. */

test.afterAll(async () => {
  await testDb.$disconnect();
});

async function publishedZine(userId: string, assetId: string, title: string) {
  return testDb.zine.create({
    data: {
      ownerId: userId,
      boardId: await defaultBoardId(userId),
      title,
      slug: `cache-${userId}`,
      published: true,
      publishedAt: new Date(),
      pages: { create: [{ pageNumber: 1, content: { assetId, caption: "" } }] },
    },
  });
}

test("repeat views are served from the cache, and an edit shows on the next view", async ({ page, request }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    const zine = await publishedZine(user.id, assets[0].id, "Harbor Notes");
    await page.goto(publicZinePath(user.publicId, zine.slug));
    await expect(page.getByRole("heading", { level: 1, name: "Harbor Notes" })).toBeVisible();

    // A change made behind the app's back is not seen: readers get the cached page, not the database.
    await testDb.zine.update({ where: { id: zine.id }, data: { title: "Changed In The Database" } });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Harbor Notes" })).toBeVisible();

    // An edit through the editor refreshes the page and its share tags right away.
    await signIn(page, user.email, user.password);
    await page.goto(`/editor/${zine.id}`);
    await page.getByLabel("Title").fill("Harbor Notes, Revised");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await page.goto(publicZinePath(user.publicId, zine.slug));
    await expect(page.getByRole("heading", { level: 1, name: "Harbor Notes, Revised" })).toBeVisible();
    const html = await (await request.get(publicZinePath(user.publicId, zine.slug))).text();
    expect(html).toContain('<meta property="og:title" content="Harbor Notes, Revised"/>');
  } finally {
    await deleteUser(user.id);
  }
});

test("unpublishing makes the page a 404 on the very next view", async ({ page, request }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    const zine = await publishedZine(user.id, assets[0].id, "Short Lived");
    expect((await request.get(publicZinePath(user.publicId, zine.slug))).status()).toBe(200);
    expect((await request.get(publicZinePath(user.publicId, zine.slug))).status()).toBe(200);

    await signIn(page, user.email, user.password);
    await page.goto(`/editor/${zine.id}`);
    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();

    expect((await request.get(publicZinePath(user.publicId, zine.slug))).status()).toBe(404);
  } finally {
    await deleteUser(user.id);
  }
});

test("renaming a photo on the board refreshes the zines that show it", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    const zine = await publishedZine(user.id, assets[0].id, "Names");
    await page.goto(publicZinePath(user.publicId, zine.slug));
    await expect(page.getByRole("img", { name: "Page 1 of 1" })).toBeVisible();

    await signIn(page, user.email, user.password);
    await page.getByRole("button", { name: "Rename persimmon.jpg" }).click();
    await page.getByLabel("Photo name").fill("Harbor at dusk");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("button", { name: "Rename Harbor at dusk" })).toBeVisible();

    await page.goto(publicZinePath(user.publicId, zine.slug));
    await expect(page.getByRole("img", { name: "Harbor at dusk" })).toBeVisible();
  } finally {
    await deleteUser(user.id);
  }
});
