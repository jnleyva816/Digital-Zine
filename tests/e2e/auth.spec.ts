import { expect, test } from "@playwright/test";
import { BOARD_URL, SEEDED, signIn } from "./helpers";

test.describe("signed out", () => {
  test("/, /board, and /boards send visitors to sign-in with an HTTP redirect", async ({ request }) => {
    const root = await request.get("/", { maxRedirects: 0 });
    expect(root.status()).toBe(307);
    expect(root.headers().location).toMatch(/\/signin$/);

    const board = await request.get("/board", { maxRedirects: 0 });
    expect(board.status()).toBe(307);
    expect(board.headers().location).toMatch(/\/signin\?callbackUrl=%2Fboard$/);

    const boards = await request.get("/boards", { maxRedirects: 0 });
    expect(boards.status()).toBe(307);
    expect(boards.headers().location).toMatch(/\/signin\?callbackUrl=%2Fboards$/);
  });

  test("the sign-in page is not indexed and hides the dev account in production", async ({ page }) => {
    await page.goto("/signin");
    await expect(page).toHaveTitle("Sign in · Folio Digital Zine");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByLabel("Studio Email")).toHaveValue("");
    await expect(page.getByText(SEEDED.password)).toHaveCount(0);
  });

  test("a wrong password shows an inline error", async ({ page }) => {
    await page.goto("/signin");
    await page.getByLabel("Studio Email").fill(SEEDED.email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in to studio/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "did not match" })).toBeVisible();
    await expect(page).toHaveURL(/\/signin/);
  });

  test("an off-site callbackUrl is ignored", async ({ page }) => {
    await page.goto("/signin?callbackUrl=https%3A%2F%2Fevil.example%2F");
    await page.getByLabel("Studio Email").fill(SEEDED.email);
    await page.getByLabel("Password").fill(SEEDED.password);
    await page.getByRole("button", { name: /sign in to studio/i }).click();
    await expect(page).toHaveURL(BOARD_URL);
  });
});

test.describe("signed in", () => {
  test("signing in lands on the board, and /signin and / redirect there", async ({ page }) => {
    await signIn(page);
    await page.goto("/signin");
    await expect(page).toHaveURL(BOARD_URL);
    await page.goto("/");
    await expect(page).toHaveURL(BOARD_URL);
  });

  test("signing out returns to sign-in and protects the board", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/signin/);
    await page.goto("/board");
    await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fboard/);
  });
});
