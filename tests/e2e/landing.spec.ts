import { expect, test } from "@playwright/test";

test.describe("landing page (DIG-95)", () => {
  test("/ shows visitors the landing page instead of redirecting", async ({ request, page }) => {
    const res = await request.get("/", { maxRedirects: 0 });
    expect(res.status()).toBe(200);

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("zine");
    await expect(page.getByRole("region", { name: "How it works" })).toBeVisible();
  });

  test("shows the Free and Pro tiers with the real prices", async ({ page }) => {
    await page.goto("/");
    const pricing = page.getByRole("region", { name: "Pricing" });
    const free = pricing.getByRole("article", { name: "Free" });
    const pro = pricing.getByRole("article", { name: "Pro" });
    await expect(free).toContainText("$0");
    await expect(free).toContainText("1 Vision Board");
    await expect(pro).toContainText("$15");
    await expect(pro).toContainText("PDF export");
  });

  test("is indexable and has its own title and share tags", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Folio/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /zine/i);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Folio/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test("its buttons lead to sign-in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/signin/);

    await page.goto("/");
    await page.getByRole("link", { name: "Start free" }).first().click();
    await expect(page).toHaveURL(/\/signin/);
  });

  test("fits a phone screen without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("link", { name: "Start free" }).first()).toBeVisible();
  });
});
