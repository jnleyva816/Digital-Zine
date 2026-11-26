import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createUser, createUserWithPhotos, defaultBoardId, deleteUser, signIn, testDb } from "./helpers";

// DIG-136: the admin panel's user list and roles.
let cleanup: string[] = [];
test.afterEach(async () => {
  await testDb.adminAction.deleteMany({ where: { targetId: { in: cleanup } } });
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});
test.afterAll(() => testDb.$disconnect());

async function make(role: "user" | "admin") {
  const user = await createUser();
  cleanup.push(user.id);
  if (role === "admin") await testDb.user.update({ where: { id: user.id }, data: { role } });
  return user;
}

test("signed out goes to sign-in, and anyone else gets a real 404", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fadmin$/);
  const user = await make("user");
  await signIn(page, user.email, user.password);
  expect((await page.goto("/admin"))?.status()).toBe(404);
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
});

test("an admin finds someone and makes them an admin, who can then open the panel", async ({ page, browser }) => {
  const admin = await make("admin");
  const target = await make("user");
  await signIn(page, admin.email, admin.password);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("link", { name: "Admin panel" }).click();
  await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search by name or email" }).fill(target.email.toUpperCase());
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("list", { name: "Users" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: `Make ${target.email} an admin` }).click();

  await page.getByLabel("Your password").fill("not-the-password");
  await page.getByRole("button", { name: "Make admin", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That password is not right." })).toBeVisible();
  await page.getByLabel("Your password").fill(admin.password);
  await page.getByRole("button", { name: "Make admin", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `${target.email} is now an admin.` })).toBeVisible();
  expect(await testDb.adminAction.findMany({ where: { targetId: target.id }, select: { actorId: true, action: true } })).toEqual([{ actorId: admin.id, action: "grant_admin" }]);

  const other = await browser.newContext();
  const theirs = await other.newPage();
  await signIn(theirs, target.email, target.password);
  expect((await theirs.goto("/admin"))?.status()).toBe(200);

  // Removing the role works on the session they already have.
  await page.getByRole("button", { name: `Remove admin role from ${target.email}` }).click();
  await page.getByLabel("Your password").fill(admin.password);
  await page.getByRole("button", { name: "Remove admin role", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `${target.email} is no longer an admin.` })).toBeVisible();
  expect((await theirs.goto("/admin"))?.status()).toBe(404);
  await other.close();
});

test("the list fits a phone", async ({ page }) => {
  const admin = await make("admin");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, admin.email, admin.password);
  await page.goto("/admin");
  await expect(page.getByRole("list", { name: "Users" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

/** A person with a published zine, and its public address (DIG-137). */
async function creatorWithZine() {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  await testDb.mediaAsset.updateMany({ where: { ownerId: user.id }, data: { status: "ready" } });
  const zine = await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId: await defaultBoardId(user.id),
      title: "Soon Hidden",
      slug: `hidden-${randomUUID().slice(0, 8)}`,
      published: true,
      publishedAt: new Date(),
      pages: { create: assets.map((a, i) => ({ pageNumber: i + 1, content: { assetId: a.id, caption: "" } })) },
    },
  });
  const { publicId } = await testDb.user.findUniqueOrThrow({ where: { id: user.id }, select: { publicId: true } });
  return { user, address: `/z/${publicId}/${zine.slug}` };
}

async function openPanelFor(page: Page, email: string) {
  await page.goto("/admin");
  await page.getByRole("searchbox", { name: "Search by name or email" }).fill(email);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("list", { name: "Users" }).getByRole("listitem")).toHaveCount(1);
}

test("deactivating signs the person out, blocks sign-in with a reason, and hides their zine, until reactivated", async ({ page, browser }) => {
  const admin = await make("admin");
  const { user, address } = await creatorWithZine();
  const theirs = await (await browser.newContext()).newPage();
  await signIn(theirs, user.email, user.password);
  expect((await theirs.goto(address))?.status()).toBe(200);

  await signIn(page, admin.email, admin.password);
  await openPanelFor(page, user.email);
  await page.getByRole("button", { name: `Deactivate ${user.email}` }).click();
  await page.getByLabel("Your password").fill(admin.password);
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `${user.email} is deactivated.` })).toBeVisible();

  // Their open session is over, their zine is gone, and signing in says why.
  await theirs.goto("/boards");
  await expect(theirs).toHaveURL(/\/signin/);
  expect((await theirs.goto(address))?.status()).toBe(404);
  await theirs.goto("/signin");
  await theirs.getByLabel("Studio Email").fill(user.email);
  await theirs.getByLabel("Password").fill("not-their-password");
  await theirs.getByRole("button", { name: /sign in to studio/i }).click();
  await expect(theirs.getByRole("alert").filter({ hasText: "did not match" })).toBeVisible();
  await theirs.getByLabel("Password").fill(user.password);
  await theirs.getByRole("button", { name: /sign in to studio/i }).click();
  await expect(theirs.getByRole("alert").filter({ hasText: "This account has been deactivated by an admin" })).toBeVisible();

  await page.getByRole("button", { name: `Reactivate ${user.email}` }).click();
  await page.getByLabel("Your password").fill(admin.password);
  await page.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `${user.email} can sign in again.` })).toBeVisible();
  expect((await theirs.goto(address))?.status()).toBe(200);
  await signIn(theirs, user.email, user.password);
  await theirs.context().close();
});

test("deleting someone needs their email typed, and removes them and their zine", async ({ page }) => {
  const admin = await make("admin");
  const { user, address } = await creatorWithZine();
  await signIn(page, admin.email, admin.password);
  await openPanelFor(page, user.email);
  await page.getByRole("button", { name: `Delete ${user.email}` }).click();
  await page.getByLabel("Your password").fill(admin.password);
  const submit = page.getByRole("button", { name: "Delete permanently" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Type their email address to confirm").fill(user.email);
  await submit.click();
  await expect(page.getByRole("status").filter({ hasText: `${user.email} was deleted.` })).toBeVisible();
  await expect(page.getByText("No one matches")).toBeVisible();
  expect(await testDb.user.findUnique({ where: { id: user.id } })).toBeNull();
  expect((await page.goto(address))?.status()).toBe(404);
  expect((await testDb.adminAction.findMany({ where: { targetId: user.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action)).toEqual(["deactivate", "delete_user"]);
});

test("an admin sees public zines with their links, and private ones only as existing (DIG-138)", async ({ page }) => {
  const admin = await make("admin");
  const { user, address } = await creatorWithZine();
  const secret = `Diary ${randomUUID()}`;
  const board = await defaultBoardId(user.id);
  const photo = await testDb.mediaAsset.findFirstOrThrow({ where: { ownerId: user.id } });
  await testDb.zine.create({
    data: { ownerId: user.id, boardId: board, title: secret, slug: `private-${randomUUID().slice(0, 8)}`, pages: { create: [{ pageNumber: 1, content: { assetId: photo.id, caption: "secret caption" } }] } },
  });

  await signIn(page, admin.email, admin.password);
  await openPanelFor(page, user.email);
  await page.getByRole("link", { name: "2 zines" }).click();
  await expect(page.getByText(`Zines by ${user.email}`)).toBeVisible();
  const zines = page.getByRole("list", { name: "Zines" }).getByRole("listitem");
  await expect(zines).toHaveCount(2);
  await expect(zines.filter({ hasText: "Private zine" })).toHaveCount(1);
  for (const hidden of [secret, "secret caption"]) expect(await page.content()).not.toContain(hidden);

  await page.getByRole("button", { name: "Private" }).click();
  await expect(zines).toHaveCount(1);
  await page.getByRole("button", { name: "Public" }).click();
  await expect(zines).toHaveCount(1);
  await zines.getByRole("link", { name: "Soon Hidden" }).click();
  await expect(page).toHaveURL(new RegExp(`${address}$`));
});

test("the zines page is a real 404 for anyone but an admin", async ({ page }) => {
  const user = await make("user");
  await signIn(page, user.email, user.password);
  expect((await page.goto("/admin/zines"))?.status()).toBe(404);
  expect((await page.request.get("/api/admin/zines")).status()).toBe(403);
});

test("an admin sees who is paying, read-only, and the page fits a phone (DIG-139)", async ({ page }) => {
  const admin = await make("admin");
  const payer = await make("user");
  await testDb.user.update({
    where: { id: payer.id },
    data: { tier: "pro", subscriptionStatus: "past_due", stripeCustomerId: `cus_${randomUUID()}`, stripeSubscriptionId: `sub_${randomUUID().replaceAll("-", "")}` },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, admin.email, admin.password);
  await page.goto("/admin");
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Subscriptions" }).click();
  await expect(page).toHaveURL(/\/admin\/subscriptions$/);
  // The test server has no Stripe key: the list still shows, and says why there are no links.
  await expect(page.getByRole("note")).toContainText("Billing is not set up");
  const row = page.getByRole("list", { name: "Subscriptions" }).getByRole("listitem").filter({ hasText: payer.email });
  await expect(row.getByText("Payment failed")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
