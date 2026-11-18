import path from "node:path";
import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { loadTestEnv } from "../../scripts/test-db";
import { CLASSIC_CHROME_TAGS, buildFujiMakerNote, withMakerNote } from "../fixtures/fuji-jpeg";
import { boardCards, createUser, deleteUser, signIn, testDb, waitForReorder } from "./helpers";

// The seed writes real-EXIF JPEGs into the test storage directory.
const FIXTURE = path.resolve(loadTestEnv().LOCAL_STORAGE_DIR, "seed/plate-02-morning-fog.jpg");
const UPLOAD_NAME = "plate-02-morning-fog.jpg";

test.afterAll(async () => {
  await testDb.$disconnect();
});

test.describe("Vision Board, seeded creator", () => {
  // These tests change the seeded creator's board, so they run in order.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("shows the seeded photos with EXIF badges", async ({ page }) => {
    const cards = boardCards(page);
    await expect(cards).toHaveCount(4);
    await expect(cards.first()).toContainText(/ISO \d+/);
    await expect(cards.first()).toContainText("FUJIFILM X-T5");
  });

  test("drag and drop reorders the board and persists", async ({ page }) => {
    const cards = boardCards(page);
    const firstName = (await cards.first().getByRole("paragraph").first().innerText()).trim();
    const from = (await cards.first().boundingBox())!;
    const to = (await cards.nth(3).boundingBox())!;
    const saved = waitForReorder(page);
    await page.mouse.move(from.x + from.width / 2, from.y + 60);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(from.x + from.width / 2 + ((to.x + to.width - 30) - (from.x + from.width / 2)) * (i / 12), from.y + 60);
    }
    await page.mouse.up();
    expect((await saved).ok()).toBe(true);

    await page.reload();
    await expect(cards.nth(3)).toContainText(firstName);

    // Move it back with the keyboard-accessible buttons, which also proves they persist.
    const earlier = page.getByRole("button", { name: `Move ${firstName} earlier` });
    while (await earlier.isEnabled()) {
      const done = waitForReorder(page);
      await earlier.click();
      await done;
    }
    await page.reload();
    await expect(cards.first()).toContainText(firstName);
  });

  test("uploads a photo, reads its EXIF in the browser, and saves a recipe", async ({ page }) => {
    const cards = boardCards(page);
    await page.getByLabel("choose files").setInputFiles(FIXTURE);
    await expect(cards).toHaveCount(5);
    const card = cards.nth(4);
    await expect(card).toContainText(UPLOAD_NAME);
    await expect(card).toContainText("ISO 200");
    await expect(card).toContainText("FUJIFILM X100VI");

    await card.getByRole("button", { name: `Add recipe for ${UPLOAD_NAME}` }).click();
    const dialog = page.getByRole("dialog", { name: "Add a film recipe" });
    await dialog.getByRole("button", { name: "Save recipe" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Give the recipe a name.");
    await dialog.getByLabel("Recipe name").fill("Portra 400");
    await dialog.getByLabel("Film simulation").selectOption("Classic Neg.");
    await dialog.getByLabel("Grain effect").selectOption("Weak, Small");
    await dialog.getByLabel("White balance", { exact: true }).selectOption("Kelvin");
    await dialog.getByLabel("Kelvin").fill("5500");
    await dialog.getByLabel("Shadow").selectOption("-0.5");
    await dialog.getByRole("button", { name: "Save recipe" }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toContainText("Portra 400");
    await expect(card).toContainText("Classic Neg.");

    const done = waitForReorder(page);
    await page.getByRole("button", { name: `Move ${UPLOAD_NAME} earlier` }).click();
    await done;
    await page.reload();
    await expect(cards.nth(3)).toContainText(UPLOAD_NAME);
    await expect(cards.nth(3)).toContainText("Portra 400");

    // Reopening shows the saved settings.
    await cards.nth(3).getByRole("button", { name: `Edit recipe for ${UPLOAD_NAME}` }).click();
    const edit = page.getByRole("dialog", { name: "Edit film recipe" });
    await expect(edit.getByLabel("Kelvin")).toHaveValue("5500");
    await expect(edit.getByLabel("Shadow")).toHaveValue("-0.5");
  });

  test("rejects files that are not images", async ({ page }) => {
    await page.getByLabel("choose files").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
    await expect(page.getByRole("list", { name: "Uploads" })).toContainText("Only JPEG, PNG, WebP, GIF, or AVIF images.");
    await expect(boardCards(page)).toHaveCount(5);
  });

  test("refuses to delete a photo a zine uses, and deletes one it does not", async ({ page }) => {
    const cards = boardCards(page);
    const seeded = cards.filter({ hasNotText: UPLOAD_NAME }).first();
    await seeded.getByRole("button", { name: /^Delete / }).click();
    await seeded.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "is used in “Golden Hour Field Notes — Issue 01”" })).toBeVisible();
    await expect(cards).toHaveCount(5);

    const mine = cards.filter({ hasText: UPLOAD_NAME });
    await mine.getByRole("button", { name: `Delete ${UPLOAD_NAME}` }).click();
    await mine.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(cards).toHaveCount(4);
    await page.reload();
    await expect(cards).toHaveCount(4);
  });

  test("fits a 390px phone screen without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(boardCards(page).first()).toBeVisible();
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflows).toBe(false);
    await expect(page.getByRole("link", { name: "Vision Board" })).toBeVisible();
  });
});

test.describe("Vision Board, recipe found in a Fujifilm photo", () => {
  test("asks the creator to name a recipe found in the photo, and does not save it on upload", async ({ page }) => {
    const user = await createUser();
    try {
      const jpeg = withMakerNote(
        await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 180, g: 90, b: 40 } } }).jpeg().toBuffer(),
        buildFujiMakerNote(CLASSIC_CHROME_TAGS),
      );
      await signIn(page, user.email, user.password);

      const created = page.waitForResponse((r) => r.url().endsWith("/api/assets") && r.request().method() === "POST");
      await page.getByLabel("choose files").setInputFiles({
        name: "DSCF0412.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(jpeg),
      });
      const response = await created;
      expect(response.ok()).toBe(true);
      const posted = response.request().postDataJSON() as { kind?: string; recipe?: unknown };
      expect(posted.kind).toBe("photo");
      expect(posted.recipe).toBeUndefined();

      const card = boardCards(page);
      await expect(card).toHaveCount(1);
      await expect(card).toContainText("DSCF0412.jpg");
      await expect(card).not.toContainText("Classic Chrome");

      await card.getByRole("button", { name: "Review recipe found in photo for DSCF0412.jpg" }).click();
      const dialog = page.getByRole("dialog", { name: "Add a film recipe" });
      await expect(dialog.getByText(/found in this photo/i)).toBeVisible();
      await expect(dialog.getByLabel("Recipe name")).toHaveValue("");
      await expect(dialog.getByLabel("Film simulation")).toHaveValue("Classic Chrome");
      await expect(dialog.getByLabel("Dynamic range")).toHaveValue("DR200");
      await expect(dialog.getByLabel("Grain effect")).toHaveValue("Weak, Large");
      await expect(dialog.getByLabel("Kelvin")).toHaveValue("5200");
      await expect(dialog.getByLabel("Highlight")).toHaveValue("0.5");
      await expect(dialog.getByLabel("Shadow")).toHaveValue("-2");

      await dialog.getByRole("button", { name: "Save recipe" }).click();
      await expect(dialog.getByRole("alert")).toContainText("Give the recipe a name.");
      await dialog.getByLabel("Recipe name").fill("Sunday Chrome");
      await dialog.getByRole("button", { name: "Save recipe" }).click();
      await expect(dialog).toBeHidden();
      await expect(card).toContainText("Sunday Chrome");
      await expect(card).toContainText("Classic Chrome");
      await expect(card.getByRole("button", { name: "Edit recipe for DSCF0412.jpg" })).toBeVisible();

      await page.reload();
      await expect(boardCards(page)).toContainText("Sunday Chrome");
      await expect(boardCards(page).getByRole("button", { name: "Edit recipe for DSCF0412.jpg" })).toBeVisible();
    } finally {
      await deleteUser(user.id);
    }
  });
});

test.describe("Vision Board, new creator", () => {
  test("shows the empty state with a way to add photos", async ({ page }) => {
    const user = await createUser();
    try {
      await signIn(page, user.email, user.password);
      await expect(page.getByRole("heading", { name: "Your board is empty" })).toBeVisible();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Add photos" }).click();
      expect((await chooser).isMultiple()).toBe(true);
    } finally {
      await testDb.user.delete({ where: { id: user.id } });
    }
  });
});
