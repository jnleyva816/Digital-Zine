import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createUserWithPhotos, deleteUser, makePro, signIn, testDb } from "./helpers";

test.afterAll(async () => {
  await testDb.$disconnect();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

async function creatorWithZine(page: Page, { pro, published }: { pro: boolean; published: boolean }) {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  if (pro) await makePro(user.id);
  const zine = await testDb.zine.create({
    data: {
      ownerId: user.id,
      title: "Brine & Light",
      slug: `pdf-${randomUUID().slice(0, 8)}`,
      published,
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
