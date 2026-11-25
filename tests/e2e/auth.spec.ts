import { expect, test } from "@playwright/test";
import { BOARD_URL, SEEDED, createUser, deleteUser, signIn } from "./helpers";

test.describe("signed out", () => {
  // `/` is the landing page for visitors now (DIG-95); see landing.spec.ts.
  test("/board and /boards send visitors to sign-in with an HTTP redirect", async ({ request }) => {
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

  test("after 5 wrong passwords the form says to wait, even for the right one (DIG-28)", async ({ page }) => {
    const user = await createUser();
    try {
      await page.goto("/signin");
      await page.getByLabel("Studio Email").fill(user.email);
      for (let i = 0; i < 5; i++) {
        await page.getByLabel("Password").fill(`wrong-${i}`);
        await page.getByRole("button", { name: /sign in to studio/i }).click();
        await expect(page.getByRole("alert").filter({ hasText: "did not match" })).toBeVisible();
      }
      await page.getByLabel("Password").fill(user.password);
      await page.getByRole("button", { name: /sign in to studio/i }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Too many sign-in attempts. Wait 15 minutes, then try again." })
      ).toBeVisible();
      await expect(page).toHaveURL(/\/signin/);
    } finally {
      await deleteUser(user.id);
    }
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
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/signin/);
    await page.goto("/board");
    await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fboard/);
  });
});
