import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createUser, createUserWithPhotos, deleteUser, makePro, signIn, testDb, defaultBoardId } from "./helpers";

// The e2e server runs without Stripe keys (as in CI), so these tests cover the unconfigured path
// and the plan states. Checkout and portal redirects are covered by component and API tests.

test.afterAll(async () => {
  await testDb.$disconnect();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

async function creator(page: Page, setup?: (id: string) => Promise<void>) {
  const user = await createUser();
  cleanup.push(user.id);
  if (setup) await setup(user.id);
  await signIn(page, user.email, user.password);
  return user;
}

test("signed-out visitors are redirected to sign in", async ({ request }) => {
  const res = await request.get("/billing", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toMatch(/\/signin\?callbackUrl=%2Fbilling$/);
});

test("a Free creator sees their plan, the Pro offer, and that billing is not configured here", async ({ page }) => {
  await creator(page);
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Your plan: Free" })).toBeVisible();
  await expect(page.getByText("$15/month")).toBeVisible();
  await expect(page.getByText(/Billing is not set up in this environment/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeDisabled();
});

test("checkout refuses cleanly when Stripe is not configured", async ({ page }) => {
  await creator(page);
  const res = await page.request.post("/api/billing/checkout");
  expect(res.status()).toBe(503);
  expect(await res.json()).toMatchObject({ configured: false });
});

test("a Pro creator sees Pro and the manage button", async ({ page }) => {
  await creator(page, makePro);
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Your plan: Pro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage subscription" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Pro plan" })).toBeVisible();
});

test("a Pro creator whose renewal failed is warned but keeps Pro", async ({ page }) => {
  await creator(page, (id) =>
    testDb.user.update({ where: { id }, data: { tier: "pro", subscriptionStatus: "past_due" } }).then(() => undefined)
  );
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Your plan: Pro" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Your last payment failed" })).toBeVisible();
});

test("returning from a cancelled checkout says nothing was charged", async ({ page }) => {
  await creator(page);
  await page.goto("/billing?checkout=cancelled");
  await expect(page.getByRole("status").filter({ hasText: "Checkout was cancelled" })).toBeVisible();
});

test("the editor's PDF upsell leads a Free creator to billing", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  const zine = await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId: await defaultBoardId(user.id),
      title: "Upsell Test",
      slug: `upsell-${randomUUID().slice(0, 8)}`,
      published: true,
      publishedAt: new Date(),
      pages: { create: [{ pageNumber: 1, content: { assetId: assets[0].id, caption: "" } }] },
    },
  });
  await signIn(page, user.email, user.password);
  await page.goto(`/editor/${zine.id}`);
  await page.getByRole("link", { name: "Upgrade to Pro" }).click();
  await expect(page).toHaveURL("/billing");
  await expect(page.getByRole("heading", { name: "Your plan: Free" })).toBeVisible();
});

test("billing fits a 390px phone screen", async ({ page }) => {
  await creator(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Your plan: Free" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
