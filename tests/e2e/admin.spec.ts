import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createUserWithPhotos, deleteUser, signIn, testDb } from "./helpers";

test.afterAll(async () => {
  await testDb.$disconnect();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

/** A signed-in user with a published zine; an admin when `admin` is true. Neither pays. */
async function userWithZine(page: Page, { admin }: { admin: boolean }) {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  if (admin) await testDb.user.update({ where: { id: user.id }, data: { role: "admin" } });
  const zine = await testDb.zine.create({
    data: {
      ownerId: user.id,
      title: "Admin Check",
      slug: `admin-${randomUUID().slice(0, 8)}`,
      published: true,
      publishedAt: new Date(),
      pages: { create: assets.map((a, i) => ({ pageNumber: i + 1, content: { assetId: a.id, caption: "" } })) },
    },
  });
  await signIn(page, user.email, user.password);
  return zine;
}

const viewSwitch = (page: Page) => page.getByRole("switch", { name: "View as Free user" });

test("an admin has every Pro feature without paying", async ({ page }) => {
  const zine = await userWithZine(page, { admin: true });
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
  await expect(viewSwitch(page)).toHaveAttribute("aria-checked", "false");

  await page.goto(`/editor/${zine.id}`);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  expect((await downloading).suggestedFilename()).toBe(`${zine.slug}.pdf`);

  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Your plan: Admin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toHaveCount(0);
});

test("View as Free shows an admin exactly what a Free user sees, until switched back", async ({ page }) => {
  const zine = await userWithZine(page, { admin: true });
  await page.goto(`/editor/${zine.id}`);
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();

  await viewSwitch(page).click();
  await expect(page.getByRole("status").filter({ hasText: "You're viewing the studio as a Free user." })).toBeVisible();
  await expect(viewSwitch(page)).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("PDF export is a Pro feature.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Free Tier" })).toBeVisible();
  expect((await page.request.get(`/api/pdf/${zine.slug}`)).status()).toBe(403);

  // It sticks across pages and reloads.
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Your plan: Free" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your plan: Free" })).toBeVisible();

  await page.getByRole("button", { name: "Back to admin view" }).click();
  await expect(page.getByRole("heading", { name: "Your plan: Admin" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "viewing the studio as a Free user" })).toHaveCount(0);
  expect((await page.request.get(`/api/pdf/${zine.slug}`)).status()).toBe(200);
});

test("regular users get no switch and cannot use the admin cookie", async ({ page, context, baseURL }) => {
  const zine = await userWithZine(page, { admin: false });
  await expect(page.getByRole("link", { name: "Free Tier" })).toBeVisible();
  await expect(viewSwitch(page)).toHaveCount(0);

  const res = await page.request.post("/api/admin/view-as", { data: { viewAsFree: true } });
  expect(res.status()).toBe(403);

  // A hand-made cookie neither grants nor changes anything for a regular user.
  await context.addCookies([{ name: "dz_view_as_free", value: "1", url: baseURL! }]);
  await page.goto(`/editor/${zine.id}`);
  await expect(page.getByText("PDF export is a Pro feature.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "viewing the studio as a Free user" })).toHaveCount(0);
});
