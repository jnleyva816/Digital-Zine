import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createUser, createUserWithPhotos, defaultBoardId, deleteUser, signIn, testDb } from "./helpers";

// DIG-111: creator profiles at /u/<handle>.
let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});
test.afterAll(() => testDb.$disconnect());

/** A handle unique to this run. */
const handle = (word: string) => `${word}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;

async function creatorWithZines() {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  await testDb.mediaAsset.updateMany({ where: { ownerId: user.id }, data: { status: "ready", width: 2400, height: 1600 } });
  const boardId = await defaultBoardId(user.id);
  const published = await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId,
      title: "Harbor at Dusk",
      slug: "harbor-at-dusk",
      published: true,
      publishedAt: new Date(),
      pages: { create: [{ pageNumber: 1, content: { assetId: assets[0].id, caption: "" } }] },
    },
  });
  await testDb.zine.create({ data: { ownerId: user.id, boardId, title: "Unfinished Roll", slug: "unfinished-roll" } });
  return { user, published };
}

test("a creator picks a handle, and readers move between the profile and the zine at phone width", async ({ page }) => {
  const { user } = await creatorWithZines();
  const mine = handle("Mara");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, user.email, user.password);
  await page.goto("/account");

  const panel = page.getByRole("region", { name: "Public profile" });
  await expect(panel).toContainText("no public profile until you pick a handle");
  await panel.getByRole("textbox", { name: "Handle" }).fill(`@${mine.toUpperCase()}`);
  await panel.getByRole("textbox", { name: "Display name" }).fill("Mara Ito");
  await panel.getByRole("textbox", { name: "Bio" }).fill("Classic Neg on the X100V.");
  await panel.getByRole("button", { name: "Save profile" }).click();
  await expect(panel.getByRole("status")).toHaveText("Saved.");
  await panel.getByRole("link", { name: "View your profile" }).click();

  await expect(page).toHaveURL(new RegExp(`/u/${mine.toLowerCase()}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Mara Ito" })).toBeVisible();
  await expect(page.getByText(`@${mine.toLowerCase()}`, { exact: true })).toBeVisible();
  await expect(page.getByText("Classic Neg on the X100V.")).toBeVisible();
  const zines = page.getByRole("list", { name: "Zines" }).getByRole("listitem");
  await expect(zines).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("Unfinished Roll");
  await expect(page.locator("body")).not.toContainText(user.email);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", `Mara Ito (@${mine.toLowerCase()})`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await zines.getByRole("link", { name: /Harbor at Dusk/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Harbor at Dusk" })).toBeVisible();
  await page.getByRole("link", { name: "Mara Ito" }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${mine.toLowerCase()}$`));
});

test("after a rename the old address redirects, and nobody else can take the old handle", async ({ page, browser }) => {
  const { user } = await creatorWithZines();
  const before = handle("before");
  const after = handle("after");
  await signIn(page, user.email, user.password);
  await page.goto("/account");
  const panel = page.getByRole("region", { name: "Public profile" });
  for (const next of [before, after]) {
    await panel.getByRole("textbox", { name: "Handle" }).fill(next);
    await panel.getByRole("button", { name: "Save profile" }).click();
    await expect(panel.getByRole("status")).toHaveText("Saved.");
  }

  const reader = await browser.newPage();
  await reader.goto(`/u/${before}`);
  await expect(reader).toHaveURL(new RegExp(`/u/${after}$`));
  await reader.goto(`/u/${after.toUpperCase()}`);
  await expect(reader).toHaveURL(new RegExp(`/u/${after}$`));
  await reader.close();

  const other = await createUser();
  cleanup.push(other.id);
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, other.email, other.password);
  await otherPage.goto("/account");
  const otherPanel = otherPage.getByRole("region", { name: "Public profile" });
  await otherPanel.getByRole("textbox", { name: "Handle" }).fill(before);
  await otherPanel.getByRole("button", { name: "Save profile" }).click();
  await expect(otherPanel.getByText("That handle is taken. Try another.")).toBeVisible();
  await otherContext.close();
});

test("unknown handles and deactivated creators are a real 404", async ({ page }) => {
  expect((await page.goto(`/u/${handle("nobody")}`))?.status()).toBe(404);
  const { user } = await creatorWithZines();
  const gone = handle("gone");
  await testDb.user.update({ where: { id: user.id }, data: { handle: gone, handles: { create: [{ handle: gone }] } } });
  expect((await page.goto(`/u/${gone}`))?.status()).toBe(200);
  await testDb.user.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } });
  expect((await page.goto(`/u/${gone}`))?.status()).toBe(404);
});
