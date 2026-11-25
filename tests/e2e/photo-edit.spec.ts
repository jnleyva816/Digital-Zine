import { defaultPdfSettings } from "../../src/lib/pdf-settings";
import { expect, test } from "@playwright/test";
import { cropPixels, parsePhotoEdit } from "../../src/lib/photo-edit";
import { boardCards, createUserWithPhotos, defaultBoardId, deleteUser, makePro, signIn, testDb } from "./helpers";
import { publicZinePath } from "../../src/lib/public-zine-path";

/** DIG-33: crop, zoom, reposition, frame, and card size, shown the same everywhere. */

test.afterAll(async () => {
  await testDb.$disconnect();
});

test("a creator crops and frames a photo, and the board, the zine, and the PDF all show it", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    await makePro(user.id);
    const slug = `edit-${user.id}`;
    await testDb.zine.create({
      data: {
        ownerId: user.id,
        boardId: await defaultBoardId(user.id),
        title: "Harbor Notes",
        slug,
        published: true,
        pdfSettings: defaultPdfSettings("darkroom", "a4"),
        publishedAt: new Date(),
        pages: { create: [{ pageNumber: 1, content: { assetId: assets[0].id, caption: "" } }] },
      },
    });

    await signIn(page, user.email, user.password);
    await page.getByRole("button", { name: "Edit persimmon.jpg" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit persimmon.jpg" });
    await expect(dialog).toContainText("This photo is used in “Harbor Notes”. Saving changes it there too, including published zines.");

    await dialog.getByRole("radio", { name: "1:1" }).check();
    await dialog.getByRole("slider", { name: "Zoom" }).fill("2");
    await dialog.getByRole("radio", { name: "Polaroid" }).check();
    await dialog.getByRole("radio", { name: "Large" }).check();

    // Drag the photo left inside the frame, which shows more of its right side.
    const preview = dialog.getByRole("group", { name: "Photo position" });
    const box = (await preview.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    // And one step down with the keyboard.
    await preview.focus();
    await page.keyboard.press("ArrowDown");

    const saved = page.waitForResponse((r) => r.url().includes(`/api/assets/${assets[0].id}`) && r.request().method() === "PATCH");
    await dialog.getByRole("button", { name: "Save" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(dialog).toBeHidden();

    const stored = await testDb.mediaAsset.findUniqueOrThrow({ where: { id: assets[0].id } });
    const edit = parsePhotoEdit(stored.edit)!;
    expect(edit).toMatchObject({ ratio: "1:1", zoom: 2, frame: "polaroid", cardSize: "large" });
    expect(edit.x).toBeGreaterThan(0.5);
    expect(edit.y).toBeGreaterThan(0.5);
    // The size was read on save, since this photo was stored before sizes were kept.
    expect(stored.width).toBeGreaterThan(0);

    // The board card shows the edit, spans two columns, and keeps it after a reload.
    await page.reload();
    const first = boardCards(page).first();
    await expect(first.getByTestId("edited-photo")).toHaveAttribute("data-ratio", "1:1");
    await expect(first.getByTestId("edited-photo")).toHaveAttribute("data-frame", "polaroid");
    const firstWidth = (await first.boundingBox())!.width;
    const secondWidth = (await boardCards(page).nth(1).boundingBox())!.width;
    expect(firstWidth).toBeGreaterThan(secondWidth * 1.8);

    // Readers see the same crop and frame; the Polaroid card is 1.1 wide for 1.25 tall.
    await page.goto(publicZinePath(user.publicId, slug));
    const card = page.getByTestId("zine-flip-card-1");
    await expect(card.getByTestId("edited-photo")).toHaveAttribute("data-frame", "polaroid");
    const cardBox = (await card.getByTestId("edited-photo").boundingBox())!;
    expect(cardBox.width / cardBox.height).toBeCloseTo(1.1 / 1.25, 1);

    // The PDF prints the same crop with the frame.
    const pdf = await page.request.get(`/api/pdf/${slug}`);
    expect(pdf.ok()).toBe(true);
    const text = (await pdf.body()).toString("latin1");
    const { extract, border } = cropPixels(edit, { width: stored.width!, height: stored.height! });
    expect(text).toContain(`/Width ${extract.width + border!.left + border!.right}`);
    expect(text).toContain(`/Height ${extract.height + border!.top + border!.bottom}`);
  } finally {
    await deleteUser(user.id);
  }
});

test("Reset returns a photo to the plain board look", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    await testDb.mediaAsset.update({
      where: { id: assets[0].id },
      data: { edit: { ratio: "16:9", zoom: 1, x: 0.5, y: 0.5, frame: "black", cardSize: "large" } },
    });
    await signIn(page, user.email, user.password);
    await expect(boardCards(page).first().getByTestId("edited-photo")).toHaveAttribute("data-frame", "black");
    await page.getByRole("button", { name: "Edit persimmon.jpg" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit persimmon.jpg" });
    await dialog.getByRole("button", { name: "Reset" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(boardCards(page).first().getByTestId("edited-photo")).toHaveAttribute("data-ratio", "4:5");
    expect((await testDb.mediaAsset.findUniqueOrThrow({ where: { id: assets[0].id } })).edit).toBeNull();
  } finally {
    await deleteUser(user.id);
  }
});
