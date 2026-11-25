import { expect, test } from "@playwright/test";
import { createUser, deleteUser, signIn, testDb } from "./helpers";

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
