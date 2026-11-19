import { expect, test, type Page } from "@playwright/test";
import { createUserWithPhotos, deleteUser, signIn, testDb, defaultBoardId } from "./helpers";

test.afterAll(async () => {
  await testDb.$disconnect();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

async function creatorWithPhotos(page: Page) {
  const data = await createUserWithPhotos();
  cleanup.push(data.user.id);
  await signIn(page, data.user.email, data.user.password);
  return data;
}

async function createZine(page: Page, title: string) {
  await page.goto("/editor");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create zine" }).click();
  await expect(page).toHaveURL(/\/editor\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
}

const pages = (page: Page) => page.getByRole("list", { name: "Pages" }).getByRole("listitem");

test("signed-out visitors are redirected from the editor", async ({ request }) => {
  const res = await request.get("/editor", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toMatch(/\/signin\?callbackUrl=%2Feditor$/);
});

test("lists the seeded creator's published zine", async ({ page }) => {
  await signIn(page);
  await page.goto("/editor");
  const item = page.getByRole("list", { name: "Zines" }).getByRole("listitem").filter({ hasText: "Golden Hour Field Notes — Issue 01" });
  await expect(item).toContainText("Published");
  await expect(item).toContainText("4 pages");
});

test("a new creator sees the empty state and can create a zine from their board", async ({ page }) => {
  await creatorWithPhotos(page);
  await page.goto("/editor");
  await expect(page.getByRole("heading", { name: "No zines yet" })).toBeVisible();

  await page.getByRole("button", { name: "Create zine" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Give the zine a title." })).toBeVisible();

  await createZine(page, "Pickle Diaries");
  await expect(pages(page)).toHaveCount(3);
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  await page.goto("/editor");
  await expect(page.getByRole("list", { name: "Zines" }).getByRole("listitem")).toContainText(["Pickle Diaries"]);
});

test("edits pages, warns about unsaved changes, and saves", async ({ page }) => {
  await creatorWithPhotos(page);
  await createZine(page, "Pickle Diaries");
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();

  await page.getByLabel("Caption for page 1").fill("Persimmons, charred");
  await page.getByRole("checkbox", { name: "Flip card on page 2" }).uncheck();
  await page.getByRole("button", { name: "Move page 3 earlier" }).click();
  await page.getByRole("button", { name: "Remove page 1" }).click();
  await page.getByRole("region", { name: "Add pages from your board" }).getByRole("button", { name: "Add persimmon.jpg" }).click();
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  // In-app navigation asks before discarding changes.
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("unsaved changes");
    void dialog.dismiss();
  });
  await page.getByRole("link", { name: "Vision Board" }).click();
  await expect(page).toHaveURL(/\/editor\//);

  await save.click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await expect(save).toBeDisabled();

  await page.reload();
  await expect(pages(page)).toHaveCount(3);
  await expect(pages(page).nth(0)).toContainText("chili.jpg");
  await expect(pages(page).nth(1)).toContainText("cellar.jpg");
  await expect(page.getByRole("checkbox", { name: "Flip card on page 2" })).not.toBeChecked();
  await expect(pages(page).nth(2)).toContainText("persimmon.jpg");
  await expect(page.getByLabel("Caption for page 3")).toHaveValue("");
});

test("does not save an invalid draft", async ({ page }) => {
  await creatorWithPhotos(page);
  await createZine(page, "Pickle Diaries");
  await page.getByLabel("Title", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Give the zine a title." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pickle Diaries");
});

test("publishes, locks the URL, and unpublishes", async ({ page }) => {
  await creatorWithPhotos(page);
  await createZine(page, "Pickle Diaries");

  await page.getByLabel("Public URL").fill("pickles-vol-1");
  for (let n = 3; n >= 1; n--) await page.getByRole("button", { name: `Remove page ${n}` }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
  await expect(page.getByText("Add a page to publish.")).toBeVisible();

  await page.getByRole("button", { name: "Add cellar.jpg" }).click();
  // Publishing saves pending edits first.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View public page" })).toHaveAttribute("href", "/z/pickles-vol-1");
  await expect(page.getByLabel("Public URL")).toHaveAttribute("readonly", "");
  await expect(page.getByText("The URL is locked because this zine has been published.")).toBeVisible();

  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Public URL")).toHaveAttribute("readonly", "");

  await page.reload();
  await expect(pages(page)).toHaveCount(1);
  await expect(page.getByLabel("Public URL")).toHaveValue("pickles-vol-1");
});

test("deletes a zine only after typing its title", async ({ page }) => {
  await creatorWithPhotos(page);
  await createZine(page, "Pickle Diaries");
  await page.getByRole("button", { name: "Delete zine" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this zine?" });
  const confirm = dialog.getByRole("button", { name: "Delete forever" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type Pickle Diaries to confirm").fill("Pickle");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type Pickle Diaries to confirm").fill("Pickle Diaries");
  await confirm.click();
  await expect(page).toHaveURL("/editor");
  await expect(page.getByRole("heading", { name: "No zines yet" })).toBeVisible();
});

test("another creator's zine is not found", async ({ page }) => {
  const seededZine = await testDb.zine.findFirstOrThrow({ where: { slug: "golden-hour-field-notes-issue-01" } });
  await creatorWithPhotos(page);
  const res = await page.goto(`/editor/${seededZine.id}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Zine not found" })).toBeVisible();
});

test("the editor fits a 390px phone screen", async ({ page }) => {
  await creatorWithPhotos(page);
  await createZine(page, "Pickle Diaries");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(pages(page).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("a Free creator with one zine is offered Pro instead of a second zine (DIG-32)", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    await testDb.zine.create({
      data: {
        ownerId: user.id,
        boardId: await defaultBoardId(user.id),
        title: "Only zine",
        slug: `only-${user.id}`,
        pages: { create: [{ pageNumber: 1, content: { assetId: assets[0]!.id, caption: "" } }] },
      },
    });
    await signIn(page, user.email, user.password);
    await page.goto("/editor");
    await expect(page.getByText("Free includes 1 zine. Upgrade to Pro for unlimited zines.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/billing");
    await expect(page.getByRole("button", { name: "Create zine" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Only zine/ })).toBeVisible();
  } finally {
    await deleteUser(user.id);
  }
});
