import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { buildFujiMakerNote, CLASSIC_CHROME_TAGS, withMakerNote } from "../fixtures/fuji-jpeg";
import { readFujiRecipe } from "../../src/lib/fuji-makernote";
import { boardCards, createUser, createUserWithPhotos, defaultBoardId, deleteUser, signIn, testDb } from "./helpers";

/** DIG-24: a library of saved recipes, used on many photos. */

const recipeRows = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Saved recipes" }).getByRole("listitem");

test.afterAll(async () => {
  await testDb.$disconnect();
});

test("a saved recipe is used on photos, edits reach every photo and readers, and deleting it leaves a copy", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    const slug = `recipes-${user.id}`;
    await testDb.zine.create({
      data: {
        ownerId: user.id,
        boardId: await defaultBoardId(user.id),
        title: "Chrome Days",
        slug,
        published: true,
        publishedAt: new Date(),
        pages: { create: [{ pageNumber: 1, content: { assetId: assets[0].id, caption: "" } }] },
      },
    });
    await signIn(page, user.email, user.password);

    // Save a recipe on the Recipes page.
    await page.getByRole("link", { name: "Recipes" }).click();
    await expect(page.getByRole("heading", { name: "No saved recipes yet" })).toBeVisible();
    await page.getByRole("button", { name: "New recipe" }).click();
    let dialog = page.getByRole("dialog", { name: "Add a film recipe" });
    await dialog.getByLabel("Recipe name").fill("Kodachrome 64");
    await dialog.getByLabel("Film simulation").selectOption("Classic Chrome");
    await dialog.getByRole("button", { name: "Save recipe" }).click();
    await expect(recipeRows(page)).toHaveCount(1);
    await expect(recipeRows(page).first()).toContainText("Used on 0 photos");

    // Use it on two photos from the board.
    await page.goto("/board");
    for (const name of ["persimmon.jpg", "cellar.jpg"]) {
      await page.getByRole("button", { name: `Add recipe for ${name}` }).click();
      dialog = page.getByRole("dialog", { name: "Add a film recipe" });
      await dialog.getByLabel("Use a saved recipe").selectOption({ label: "Kodachrome 64" });
      await dialog.getByRole("button", { name: "Use saved recipe" }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(boardCards(page).nth(0)).toContainText("Kodachrome 64");
    await expect(boardCards(page).nth(1)).toContainText("Kodachrome 64");

    // A linked photo says so in its dialog.
    await page.getByRole("button", { name: "Edit recipe for persimmon.jpg" }).click();
    await expect(page.getByText(/Linked to your saved recipe “Kodachrome 64”/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    // Editing the saved recipe changes it on both photos and for readers.
    await page.goto("/recipes");
    await expect(recipeRows(page).first()).toContainText("Used on 2 photos");
    await page.getByRole("button", { name: "Edit Kodachrome 64" }).click();
    dialog = page.getByRole("dialog", { name: "Edit film recipe" });
    await expect(dialog).toContainText("Saving changes this recipe on 2 photos.");
    await dialog.getByLabel("Recipe name").fill("Kodachrome 25");
    await dialog.getByRole("button", { name: "Save recipe" }).click();
    await expect(recipeRows(page).first()).toContainText("Kodachrome 25");

    await page.goto("/board");
    await expect(boardCards(page).nth(0)).toContainText("Kodachrome 25");
    await expect(boardCards(page).nth(1)).toContainText("Kodachrome 25");
    await page.goto(`/z/${slug}`);
    await page.getByRole("button", { name: /Page 1: flip/ }).click();
    await expect(page.getByTestId("zine-flip-card-1")).toContainText("Kodachrome 25");

    // Deleting the saved recipe leaves each photo with its own copy.
    await page.goto("/recipes");
    await page.getByRole("button", { name: "Delete Kodachrome 25" }).click();
    await expect(page.getByText("Its 2 photos keep a copy of the settings.")).toBeVisible();
    await page.getByRole("button", { name: "Delete recipe" }).click();
    await expect(page.getByRole("heading", { name: "No saved recipes yet" })).toBeVisible();
    await page.goto("/board");
    await expect(boardCards(page).nth(0)).toContainText("Kodachrome 25");
    expect((await testDb.mediaAsset.findUniqueOrThrow({ where: { id: assets[0].id } })).recipeId).toBeNull();
  } finally {
    await deleteUser(user.id);
  }
});

test("a photo's own recipe can be saved to the library", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    await testDb.mediaAsset.update({
      where: { id: assets[0].id },
      data: { kind: "recipe", recipe: { name: "Sunday Chrome", filmSimulation: "Classic Chrome" } },
    });
    await signIn(page, user.email, user.password);
    await page.getByRole("button", { name: "Edit recipe for persimmon.jpg" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit film recipe" });
    await dialog.getByRole("button", { name: "Save to library" }).click();
    await expect(dialog).toBeHidden();

    await page.goto("/recipes");
    await expect(recipeRows(page)).toHaveCount(1);
    await expect(recipeRows(page).first()).toContainText("Sunday Chrome");
    await expect(recipeRows(page).first()).toContainText("Used on 1 photo");
  } finally {
    await deleteUser(user.id);
  }
});

test("an upload whose settings match a saved recipe suggests it by name", async ({ page }) => {
  const user = await createUser();
  try {
    const jpeg = withMakerNote(
      await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 180, g: 90, b: 40 } } }).jpeg().toBuffer(),
      buildFujiMakerNote(CLASSIC_CHROME_TAGS)
    );
    const bytes = Buffer.from(jpeg);
    const found = readFujiRecipe(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))!;
    await testDb.recipe.create({ data: { ownerId: user.id, name: "Sunday Chrome", settings: found } });

    await signIn(page, user.email, user.password);
    await page.getByLabel("choose files").setInputFiles({ name: "DSCF0412.jpg", mimeType: "image/jpeg", buffer: bytes });
    await page.getByRole("button", { name: "Review recipe found in photo for DSCF0412.jpg" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a film recipe" });
    await expect(dialog.getByText("These settings match your saved recipe “Sunday Chrome”.")).toBeVisible();
    await dialog.getByRole("button", { name: "Use Sunday Chrome" }).click();
    await expect(dialog).toBeHidden();
    await expect(boardCards(page).first()).toContainText("Sunday Chrome");
  } finally {
    await deleteUser(user.id);
  }
});
