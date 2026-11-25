import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createUserWithPhotos, defaultBoardId, deleteUser, signIn, storedFileExists, testDb } from "./helpers";
import { publicZinePath } from "../../src/lib/public-zine-path";
import { startMailSink } from "./mail-sink";

// DIG-108: deleting your own account, through the real page.
let sink: Awaited<ReturnType<typeof startMailSink>>;
test.beforeAll(async () => {
  // Signing up again sends a verification email, which needs somewhere to go.
  sink = await startMailSink();
});
test.afterAll(async () => {
  await sink.close();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
  await testDb.user.deleteMany({ where: { email: { startsWith: "deleted-again-" } } });
});

async function arrange() {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  const slug = `bye-${randomUUID().slice(0, 8)}`;
  await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId: await defaultBoardId(user.id),
      title: "Goodbye Zine",
      slug,
      published: true,
      publishedAt: new Date(),
      pages: { create: [{ pageNumber: 1, content: { assetId: assets[0].id, caption: "Last one" } }] },
    },
  });
  return { user, assets, path: publicZinePath(user.publicId, slug) };
}

const alertWith = (page: import("@playwright/test").Page, text: string | RegExp) =>
  page.getByRole("alert").filter({ hasText: text });

test("a creator deletes their account: the zine, the files, and the sign-in are gone", async ({ page, request }) => {
  const { user, assets, path } = await arrange();
  expect((await request.get(path)).status()).toBe(200);
  expect((await request.get("/sitemap.xml").then((r) => r.text()))).toContain(path);
  expect(await storedFileExists(assets[0].storageKey)).toBe(true);

  await signIn(page, user.email, user.password);
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Delete account" })).toBeVisible();
  await expect(page.getByText(/cannot be undone/i)).toBeVisible();

  await page.getByRole("button", { name: /delete my account/i }).click();
  const confirm = page.getByRole("button", { name: "Permanently delete my account" });
  await expect(confirm).toBeDisabled();

  // The wrong email keeps the button off; the right email with a wrong password is refused.
  await page.getByLabel(/type your email address/i).fill("someone-else@test.local");
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/type your email address/i).fill(user.email);
  await page.getByLabel("Your password").fill("not-my-password");
  await confirm.click();
  await expect(alertWith(page, /password is not right/i)).toBeVisible();
  expect(await testDb.user.count({ where: { id: user.id } })).toBe(1);

  await page.getByLabel("Your password").fill(user.password);
  await confirm.click();
  await expect(page.getByRole("status").filter({ hasText: "Your account has been deleted." })).toBeVisible();

  expect(await testDb.user.count({ where: { id: user.id } })).toBe(0);
  expect(await testDb.mediaAsset.count({ where: { ownerId: user.id } })).toBe(0);
  expect(await storedFileExists(assets[0].storageKey)).toBe(false);

  // The public zine is gone, and so is its sitemap entry.
  expect((await request.get(path)).status()).toBe(404);
  expect(await request.get("/sitemap.xml").then((r) => r.text())).not.toContain(path);

  // This browser is signed out, and the credentials no longer work.
  await page.goto("/board");
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("Studio Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: /sign in to studio/i }).click();
  await expect(alertWith(page, /did not match/i)).toBeVisible();
});

test("the same email can sign up again afterwards", async ({ page }) => {
  const { user } = await arrange();
  await signIn(page, user.email, user.password);
  await page.goto("/account");
  await page.getByRole("button", { name: /delete my account/i }).click();
  await page.getByLabel(/type your email address/i).fill(user.email);
  await page.getByLabel("Your password").fill(user.password);
  await page.getByRole("button", { name: "Permanently delete my account" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your account has been deleted." })).toBeVisible();

  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Back Again");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-9");
  await page.getByLabel("Confirm password").fill("correct-horse-9");
  await page.getByRole("checkbox", { name: /agree/i }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
  const fresh = await testDb.user.findUniqueOrThrow({ where: { email: user.email } });
  expect(fresh.id).not.toBe(user.id);
  cleanup.push(fresh.id);
});

test("signed-out visitors cannot open the account page, and a signed-in one sees it is kept out of search", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/signin/);

  const { user } = await arrange();
  await signIn(page, user.email, user.password);
  await page.goto("/account");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});

test("the account page fits a 390px phone screen", async ({ page }) => {
  const { user } = await arrange();
  await signIn(page, user.email, user.password);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  await page.getByRole("button", { name: /delete my account/i }).click();
  await expect(page.getByLabel(/type your email address/i)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
