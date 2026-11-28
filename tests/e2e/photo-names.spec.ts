import { expect, test } from "@playwright/test";
import { boardCards, createUserWithPhotos, defaultBoardId, deleteUser, signIn, testDb } from "./helpers";
import { publicZinePath } from "../../src/lib/zine/public-zine-path";

/** DIG-34: photos get a name in the app; the camera file name is kept. */

test.afterAll(async () => {
  await testDb.$disconnect();
});

test("a creator names a photo, and the name shows on the board, in the editor, and to readers", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    const slug = `names-${user.id}`;
    const zine = await testDb.zine.create({
      data: {
        ownerId: user.id,
        boardId: await defaultBoardId(user.id),
        title: "Named",
        slug,
        published: true,
        publishedAt: new Date(),
        pages: { create: [{ pageNumber: 1, content: { assetId: assets[0].id, caption: "Low tide" } }] },
      },
    });

    await signIn(page, user.email, user.password);
    await page.getByRole("button", { name: "Rename persimmon.jpg" }).click();
    await expect(page.getByText("Leave blank to use the file name, persimmon.jpg.")).toBeVisible();
    await page.getByLabel("Photo name").fill("Harbor at dusk");
    await page.getByRole("button", { name: "Save name" }).click();

    const card = boardCards(page).first();
    await expect(card).toContainText("Harbor at dusk");
    await expect(card).toContainText("persimmon.jpg");
    await page.reload();
    await expect(boardCards(page).first()).toContainText("Harbor at dusk");
    await expect(page.getByRole("img", { name: "Harbor at dusk" })).toBeVisible();

    await page.goto(`/editor/${zine.id}`);
    await expect(
      page.getByRole("region", { name: "Add pages from your board" }).getByRole("button", { name: "Add Harbor at dusk" })
    ).toBeVisible();

    await page.goto(publicZinePath(user.publicId, slug));
    await expect(page.getByRole("img", { name: "Harbor at dusk" })).toBeVisible();
    await page.getByRole("button", { name: /Page 1: flip/ }).click();
    await expect(page.getByRole("heading", { name: "Harbor at dusk" })).toBeVisible();

    // Clearing the name brings back the file name on the board.
    await page.goto("/board");
    await page.getByRole("button", { name: "Rename Harbor at dusk" }).click();
    await page.getByLabel("Photo name").fill("");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(boardCards(page).first().getByText("persimmon.jpg", { exact: true })).toHaveCount(1);
    await expect(boardCards(page).first()).not.toContainText("Harbor at dusk");
  } finally {
    await deleteUser(user.id);
  }
});
