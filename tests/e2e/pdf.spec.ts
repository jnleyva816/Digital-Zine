import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { defaultPdfSettings } from "../../src/lib/pdf/pdf-settings";
import { readPdf } from "../pdf-text";
import { createUserWithPhotos, deleteUser, makePro, signIn, testDb, defaultBoardId } from "./helpers";

test.afterAll(async () => {
  await testDb.$disconnect();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

async function creatorWithZine(page: Page, { pro, published, styled = true }: { pro: boolean; published: boolean; styled?: boolean }) {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  if (pro) await makePro(user.id);
  const zine = await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId: await defaultBoardId(user.id),
      title: "Brine & Light",
      slug: `pdf-${randomUUID().slice(0, 8)}`,
      published,
      ...(styled ? { pdfSettings: defaultPdfSettings("darkroom", "a4") } : {}),
      publishedAt: published ? new Date() : null,
      pages: {
        create: assets.map((a, i) => ({ pageNumber: i + 1, content: { assetId: a.id, caption: `Plate ${i + 1}` } })),
      },
    },
  });
  await signIn(page, user.email, user.password);
  await page.goto(`/editor/${zine.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Brine & Light" })).toBeVisible();
  return zine;
}

test("a Pro creator downloads their published zine as a PDF", async ({ page }) => {
  const zine = await creatorWithZine(page, { pro: true, published: true });

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toBe(`${zine.slug}.pdf`);
  const bytes = await fs.readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  // Cover plus three pages: every photo was found and drawn.
  expect(bytes.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g)).toHaveLength(4);
  await expect(page.getByText("PDF downloaded.")).toBeVisible();
});

test("a Free creator sees an upgrade prompt instead of a download", async ({ page }) => {
  await creatorWithZine(page, { pro: false, published: true });
  await expect(page.getByText("PDF export is a Pro feature.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/billing");
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
});

test("the download appears once a draft is published", async ({ page }) => {
  await creatorWithZine(page, { pro: true, published: false });
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
});

test("a Pro reader cannot export someone else's zine", async ({ page, request }) => {
  const reader = await createUserWithPhotos();
  cleanup.push(reader.user.id);
  await makePro(reader.user.id);
  await signIn(page, reader.user.email, reader.user.password);
  const res = await page.request.get("/api/pdf/golden-hour-field-notes-issue-01");
  expect(res.status()).toBe(404);
  // Signed out gets 401, not the file.
  expect((await request.get("/api/pdf/golden-hour-field-notes-issue-01")).status()).toBe(401);
});

test("downloading with unsaved edits does not trigger the leave warning", async ({ page }) => {
  await creatorWithZine(page, { pro: true, published: true });
  await page.getByLabel("Caption for page 1").fill("Edited but not saved");
  await expect(page.getByText("The PDF uses the last saved version. Save first to include your changes.")).toBeVisible();

  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  await downloading;
  expect(dialogs).toEqual([]);
  await expect(page.getByText("Unsaved changes")).toBeVisible();
});

const savedStyle = async (id: string) => (await testDb.zine.findUniqueOrThrow({ where: { id } })).pdfSettings;

test("a first PDF: pick a template and paper size, then export in that style", async ({ page }) => {
  const zine = await creatorWithZine(page, { pro: true, published: true, styled: false });
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
  await page.getByRole("button", { name: "Style your PDF" }).click();

  const panel = page.getByRole("dialog", { name: "Style your PDF" });
  const exportPdf = panel.getByRole("button", { name: "Export PDF" });
  await expect(panel.getByRole("button", { pressed: true })).toHaveText(["Booklet PDF"]);
  await expect(exportPdf).toBeDisabled();
  await panel.getByRole("button", { name: /^Gallery Light pages/ }).click();
  await expect(exportPdf).toBeDisabled();
  await panel.getByRole("button", { name: /^Letter/ }).click();

  const downloading = page.waitForEvent("download");
  await exportPdf.click();
  const pages = readPdf(await fs.readFile(await (await downloading).path()));
  expect(pages).toHaveLength(4);
  expect(pages[0].width).toBeCloseTo(612, 0);
  // Only Gallery numbers its pages as plates.
  expect(pages[1].text).toContain("PLATE 1");
  expect(await savedStyle(zine.id)).toEqual(defaultPdfSettings("gallery", "letter"));
});

test("changing the template changes the preview, the saved style, and the next export", async ({ page }) => {
  const zine = await creatorWithZine(page, { pro: true, published: true });
  await page.getByRole("button", { name: "Style your PDF" }).click();
  const panel = page.getByRole("dialog", { name: "Style your PDF" });
  const cover = panel.getByRole("img", { name: "Cover" });
  await expect(cover).toHaveCSS("background-color", "rgb(22, 20, 18)");

  await panel.getByRole("button", { name: /^Riso Two-ink/ }).click();
  await panel.getByRole("button", { name: "Template cover" }).click();
  await expect(cover).toHaveCSS("background-color", "rgb(242, 237, 228)");
  await expect(cover.locator("img")).toHaveCount(1);
  // The preview's photos and fonts really load, under the enforced Content Security Policy.
  await expect
    .poll(() => cover.locator("img").evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
  await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => /anton/i.test(f.family) && f.status === "loaded"))).toBe(true);

  // By keyboard, and back out of the panel.
  await panel.getByRole("button", { name: "Typewriter" }).focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "Typewriter" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect.poll(() => savedStyle(zine.id)).toEqual({ ...defaultPdfSettings("riso", "a4"), typeface: "typewriter", cover: { style: "template", photo: null } });

  await page.reload();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const pages = readPdf(await fs.readFile(await (await downloading).path()));
  expect(pages[0].text).toContain("3 PAGES");
});

test("a Free creator styles and previews on a phone without sideways scrolling", async ({ page }) => {
  const zine = await creatorWithZine(page, { pro: false, published: true, styled: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Style your PDF" }).click();
  const panel = page.getByRole("dialog", { name: "Style your PDF" });
  await panel.getByRole("button", { name: /^Contact Sheet/ }).click();
  await panel.getByRole("button", { name: /^A4/ }).click();
  await expect(panel.getByRole("img", { name: "Cover" })).toContainText("Brine & Light");
  await expect(panel.getByRole("button", { name: "Export PDF" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Upgrade to Pro" })).toBeVisible();
  expect(await panel.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
  await expect.poll(() => savedStyle(zine.id)).toEqual(defaultPdfSettings("contact", "a4"));
});

test("a changed recipe card shows in the preview and in the export", async ({ page }) => {
  const zine = await creatorWithZine(page, { pro: true, published: true });
  const recipe = { name: "Harbor Chrome", filmSimulation: "Classic Chrome", dynamicRange: "DR200", sharpness: 1 };
  await testDb.mediaAsset.updateMany({ where: { ownerId: zine.ownerId, originalName: "cellar.jpg" }, data: { recipe } });
  await page.reload();
  await page.getByRole("button", { name: "Style your PDF" }).click();
  const panel = page.getByRole("dialog", { name: "Style your PDF" });
  await panel.getByRole("button", { name: "Recipe card options" }).click();
  const card = panel.getByRole("img", { name: "Photo page with its recipe card" });
  await expect(card).toContainText("Harbor Chrome");

  await panel.getByRole("button", { name: "Lab label" }).click();
  await panel.getByRole("button", { name: /^Full/ }).click();
  await panel.getByRole("button", { name: "On photo, bottom right" }).click();
  await panel.getByRole("checkbox", { name: "Recipe name" }).uncheck();
  await panel.getByRole("checkbox", { name: /^Camera settings/ }).check();
  await expect(panel.getByRole("status")).toContainText("hides a lot of it");
  await expect(card).toContainText("RECIPE · 02A");

  await panel.getByRole("button", { name: "Back to style" }).click();
  const downloading = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export PDF" }).click();
  const pages = readPdf(await fs.readFile(await (await downloading).path()));
  expect(pages[2].text).toContain("RECIPE · 02A");
  expect(pages[2].text).toContain("Sharp");
  expect(pages[2].text).toContain("ISO 200");
  expect(pages[2].text).not.toContain("Harbor Chrome");
  expect(await savedStyle(zine.id)).toMatchObject({ card: { style: "label", size: "full", location: "over-br", showName: false, showExif: true } });
});

test("the recipe card preview fits a phone", async ({ page }) => {
  await creatorWithZine(page, { pro: false, published: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Style your PDF" }).click();
  const panel = page.getByRole("dialog", { name: "Style your PDF" });
  await panel.getByRole("button", { name: "Recipe card options" }).click();
  const box = await panel.getByRole("img", { name: "Photo page with its recipe card" }).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
});

test("a Free creator makes a mini zine: picks photos, and downloads the print sheet", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos(["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg", "g.jpg"]);
  cleanup.push(user.id);
  const zine = await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId: await defaultBoardId(user.id),
      title: "Pocket Harbor",
      slug: `mini-${randomUUID().slice(0, 8)}`,
      published: true,
      publishedAt: new Date(),
      pages: { create: assets.map((a, i) => ({ pageNumber: i + 1, content: { assetId: a.id, caption: `Plate ${i + 1}` } })) },
    },
  });
  await signIn(page, user.email, user.password);
  await page.goto(`/editor/${zine.id}`);
  await page.getByRole("button", { name: "Style your PDF" }).click();
  const panel = page.getByRole("dialog", { name: "Style your PDF" });
  await panel.getByRole("button", { name: "Mini zine (1 sheet)" }).click();
  await panel.getByRole("button", { name: /^Gallery Light pages/ }).click();
  await panel.getByRole("button", { name: /^Letter/ }).click();
  await expect(panel.getByText("The mini zine holds 6 photos. Remove one to add another.")).toBeVisible();
  await panel.getByRole("button", { name: "Remove Plate 2" }).click();
  await panel.getByRole("button", { name: "Add photo" }).click();
  await panel.getByRole("button", { name: "Add Plate 7" }).click();
  await panel.getByRole("button", { name: "Move Plate 7 earlier" }).click();
  await panel.getByRole("checkbox", { name: "Fold and cut guides" }).uncheck();

  const downloading = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download print sheet" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`${zine.slug}-mini.pdf`);
  const pages = readPdf(await fs.readFile(await download.path()));
  expect(pages).toHaveLength(1);
  expect(pages[0].width).toBeCloseTo(792, 0);
  expect(pages[0].text).toContain("Plate 7");
  expect(pages[0].text).not.toContain("Plate 2");
  const ids = [0, 2, 3, 4, 6, 5].map((i) => assets[i].id);
  expect(await savedStyle(zine.id)).toEqual({ ...defaultPdfSettings("gallery", "letter"), format: "mini", guides: false, miniPhotos: ids });

  // The folding steps have a page of their own.
  const opened = page.waitForEvent("popup");
  await panel.getByRole("link", { name: /Folding steps/ }).click();
  const help = await opened;
  await expect(help.getByRole("heading", { level: 1, name: "How to fold a mini zine" })).toBeVisible();
  await expect(help.getByRole("list", { name: "How to fold a mini zine" }).getByRole("listitem")).toHaveCount(6);

  // On a phone, nothing scrolls sideways.
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await panel.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
});

test("the cover starts as the title only, and can be any photo in the zine (DIG-126)", async ({ page }) => {
  const zine = await creatorWithZine(page, { pro: true, published: true });
  const images = (content: string) => (content.match(/ Do\b/g) ?? []).length;
  await page.getByRole("button", { name: "Style your PDF" }).click();
  const panel = page.getByRole("dialog", { name: "Style your PDF" });
  const exported = async () => {
    const downloading = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Export PDF" }).click();
    return readPdf(await fs.readFile(await (await downloading).path()))[0];
  };
  await expect(panel.getByRole("button", { name: "Title only" })).toHaveAttribute("aria-pressed", "true");
  expect(images((await exported()).content)).toBe(0);

  await panel.getByRole("button", { name: "Full-page photo" }).click();
  await panel.getByRole("group", { name: "Cover photo" }).getByRole("button", { name: "Plate 3" }).click();
  await expect(panel.getByRole("img", { name: "Cover", exact: true }).locator("img")).toHaveCount(1);
  expect(images((await exported()).content)).toBe(1);

  const third = await testDb.zinePage.findFirstOrThrow({ where: { zineId: zine.id, pageNumber: 3 } });
  expect(await savedStyle(zine.id)).toMatchObject({ cover: { style: "full", photo: (third.content as { assetId: string }).assetId } });
});
