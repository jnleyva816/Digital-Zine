import { expect, test, type Page } from "@playwright/test";
import { createUserWithPhotos, defaultBoardId, deleteUser, signIn, testDb } from "./helpers";

// DIG-112: a creator makes a zine private with a code; a reader with the link enters it to read.
let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});
test.afterAll(() => testDb.$disconnect());

const TITLE = "Harbor at Dusk";
const DESCRIPTION = "Three frames from the breakwater";

async function creatorWithZine() {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  await testDb.mediaAsset.updateMany({ where: { ownerId: user.id }, data: { status: "ready", width: 2400, height: 1600 } });
  const zine = await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId: await defaultBoardId(user.id),
      title: TITLE,
      description: DESCRIPTION,
      slug: "harbor-at-dusk",
      published: true,
      publishedAt: new Date(),
      pages: { create: [{ pageNumber: 1, content: { assetId: assets[0].id, caption: "Breakwater" } }] },
    },
  });
  return { user, zine, photoKey: assets[0].storageKey, address: `/z/${user.publicId}/${zine.slug}` };
}

async function setAccess(page: Page, zineId: string, code: string) {
  await page.goto(`/editor/${zineId}`);
  const panel = page.getByRole("group", { name: "Who can read it" });
  await panel.getByRole("radio", { name: /private/i }).check();
  await page.getByRole("textbox", { name: /access code/i }).fill(code);
  await page.getByRole("button", { name: "Save access" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The zine is private" })).toBeVisible();
}

test("a private zine shows nothing until the code is entered, and a new code locks readers out again", async ({ page, browser }) => {
  const { user, zine, photoKey, address } = await creatorWithZine();
  await signIn(page, user.email, user.password);
  await setAccess(page, zine.id, "harbor-dusk");
  await expect(page.getByText(/anyone who already has a photo's address can still open that photo/i)).toBeVisible();

  // What a link preview or search engine fetches: no title, description, photo, or share image.
  const reader = await browser.newContext();
  const raw = await reader.request.get(address);
  expect(raw.status()).toBe(200);
  const html = await raw.text();
  expect(html).not.toContain(TITLE);
  expect(html).not.toContain(DESCRIPTION);
  expect(html).not.toContain("Breakwater");
  expect(html).not.toContain(photoKey);
  expect(html).not.toContain("application/ld+json");
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow/);

  const readerPage = await reader.newPage();
  await readerPage.goto(address);
  await expect(readerPage.getByRole("heading", { level: 1, name: "This zine is private" })).toBeVisible();
  await expect(readerPage).toHaveTitle(/^Private zine/);

  await readerPage.getByRole("textbox", { name: "Access code" }).fill("harbor-dawn");
  await readerPage.getByRole("button", { name: "Open zine" }).click();
  await expect(readerPage.getByRole("alert").filter({ hasText: "That code is not right." })).toBeVisible();

  await readerPage.getByRole("textbox", { name: "Access code" }).fill("harbor-dusk");
  await readerPage.getByRole("button", { name: "Open zine" }).click();
  await expect(readerPage.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await readerPage.reload();
  await expect(readerPage.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();

  // The unlock is HttpOnly and sent only to this zine's page.
  const [cookie] = (await reader.cookies()).filter((c) => c.name.startsWith("folio_unlock_"));
  expect(cookie).toMatchObject({ httpOnly: true, path: address, sameSite: "Lax" });

  // Not listed in the sitemap.
  expect(await (await reader.request.get("/sitemap.xml")).text()).not.toContain(address);

  // The creator changes the code: the reader's earlier unlock stops working.
  await page.getByRole("textbox", { name: /new access code/i }).fill("new-code-42");
  await page.getByRole("button", { name: "Save access" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The zine is private" })).toBeVisible();
  await readerPage.reload();
  await expect(readerPage.getByRole("heading", { level: 1, name: "This zine is private" })).toBeVisible();
  await reader.close();
});

test("making a private zine public opens it to everyone again", async ({ page, browser }) => {
  const { user, zine, address } = await creatorWithZine();
  await signIn(page, user.email, user.password);
  await setAccess(page, zine.id, "harbor-dusk");
  await page.getByRole("radio", { name: /public/i }).check();
  await page.getByRole("button", { name: "Save access" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The zine is public" })).toBeVisible();

  const reader = await browser.newContext();
  const readerPage = await reader.newPage();
  await readerPage.goto(address);
  await expect(readerPage.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await reader.close();
});
