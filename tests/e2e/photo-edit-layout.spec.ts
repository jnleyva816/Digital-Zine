import { expect, test, type Locator, type Page } from "@playwright/test";
import { createUserWithPhotos, deleteUser, signIn, testDb } from "./helpers";

/** DIG-48: the photo edit dialog has room for its controls at every width. */

test.afterAll(async () => {
  await testDb.$disconnect();
});

async function openEditor(page: Page) {
  const { user } = await createUserWithPhotos();
  await signIn(page, user.email, user.password);
  await page.getByRole("button", { name: "Edit persimmon.jpg" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit persimmon.jpg" });
  await expect(dialog).toBeVisible();
  return { user, dialog };
}

const OPTIONS = ["Original", "4:5", "1:1", "3:2", "2:3", "16:9", "None", "Thin white", "White mat", "Black", "Polaroid", "Normal", "Large"];

/** Every option is at least 44 px square to tap, and its label is not cut off. */
async function expectRoomyOptions(dialog: Locator) {
  for (const name of OPTIONS) {
    const label = dialog.getByRole("radio", { name }).locator("xpath=ancestor::label[1]");
    const box = (await label.boundingBox())!;
    expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${name} width`).toBeGreaterThanOrEqual(44);
    const clipped = await label.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped, `${name} label is cut off`).toBe(false);
    const wrapped = await label.evaluate((el) => {
      const text = el.querySelector("span");
      return text ? text.getBoundingClientRect().height > parseFloat(getComputedStyle(text).lineHeight) * 1.5 : false;
    });
    expect(wrapped, `${name} label wraps onto two lines`).toBe(false);
  }
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("every option is easy to tap and fully readable", async ({ page }) => {
    const { user, dialog } = await openEditor(page);
    try {
      // Scroll each option into view as a thumb would; measure it where it sits.
      await expectRoomyOptions(dialog);
    } finally {
      await deleteUser(user.id);
    }
  });

  test("the photo stays in view while the controls scroll, and Save and Cancel never leave the screen", async ({ page }) => {
    const { user, dialog } = await openEditor(page);
    try {
      const preview = dialog.getByRole("group", { name: "Photo position" });
      const viewport = page.viewportSize()!;

      // Scroll the controls all the way down.
      await page.locator("[data-editor-scroll]").evaluate((el) => (el.scrollTop = el.scrollHeight));
      await dialog.getByRole("radio", { name: "Large" }).scrollIntoViewIfNeeded();

      const photo = (await preview.boundingBox())!;
      const visibleHeight = Math.min(photo.y + photo.height, viewport.height) - Math.max(photo.y, 0);
      expect(visibleHeight, "photo is still visible").toBeGreaterThan(photo.height * 0.9);
      expect(photo.height, "photo leaves room for the controls").toBeLessThan(viewport.height * 0.45);

      for (const name of ["Save", "Cancel", "Reset"]) {
        const box = (await dialog.getByRole("button", { name }).boundingBox())!;
        expect(box.y, `${name} top`).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `${name} bottom`).toBeLessThanOrEqual(viewport.height);
        expect(box.height, `${name} is tall enough to tap`).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await deleteUser(user.id);
    }
  });

  test("the dialog fits the screen without sideways scrolling", async ({ page }) => {
    const { user, dialog } = await openEditor(page);
    try {
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(360);
      expect(box.height).toBeLessThanOrEqual(640);
      const overflows = await page.locator("[data-editor-scroll]").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(overflows).toBe(false);
    } finally {
      await deleteUser(user.id);
    }
  });
});

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("controls have their own column, with roomy options and the footer in view", async ({ page }) => {
    const { user, dialog } = await openEditor(page);
    try {
      await expectRoomyOptions(dialog);
      const photo = (await dialog.getByRole("group", { name: "Photo position" }).boundingBox())!;
      const controls = (await dialog.getByRole("slider", { name: "Zoom" }).boundingBox())!;
      expect(controls.x, "controls sit beside the photo").toBeGreaterThan(photo.x + photo.width - 1);
      const save = (await dialog.getByRole("button", { name: "Save" }).boundingBox())!;
      expect(save.y + save.height).toBeLessThanOrEqual(800);
    } finally {
      await deleteUser(user.id);
    }
  });
});
