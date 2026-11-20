import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { BOARD_URL, SEEDED, signIn, testDb } from "./helpers";
import { startMailSink } from "./mail-sink";

// DIG-94: creating an account, verifying the email, and the Google button.
const RUN = randomUUID().slice(0, 8);
const emails: string[] = [];
const newEmail = () => {
  const email = `signup-${RUN}-${emails.length}@test.local`;
  emails.push(email);
  return email;
};

let sink: Awaited<ReturnType<typeof startMailSink>>;
test.beforeAll(async () => {
  sink = await startMailSink();
});
test.afterAll(async () => {
  await sink.close();
  await testDb.user.deleteMany({ where: { email: { in: emails } } });
});

async function fillSignup(page: Page, email: string, overrides: { confirm?: string; accept?: boolean } = {}) {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Ada Lovelace");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-9");
  await page.getByLabel("Confirm password").fill(overrides.confirm ?? "correct-horse-9");
  if (overrides.accept !== false) await page.getByRole("checkbox", { name: /agree/i }).check();
}

test.describe("sign up", () => {
  test("is one click away from sign-in, and back", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("link", { name: /create an account/i }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("heading", { name: /create your studio/i })).toBeVisible();
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/signin$/);
  });

  test("a new creator signs up, verifies their email from the message, and lands on their board", async ({ page }) => {
    const email = newEmail();
    await fillSignup(page, email);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect.poll(() => sink.linksFor(email).length).toBe(1);
    const message = sink.mail.find((m) => m.to.includes(email))!;
    expect(message.authorization).toBe("Bearer re_e2e_key");
    expect(message.subject).toMatch(/verify/i);

    // Before verifying, the right password is not enough, and the page says why.
    await page.goto("/signin");
    await page.getByLabel("Studio Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("correct-horse-9");
    await page.getByRole("button", { name: /sign in to studio/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /verify your email/i })).toBeVisible();
    await expect(page).toHaveURL(/\/signin/);

    // Asking again sends a new link, and the first one stops working.
    await page.getByRole("button", { name: /resend verification email/i }).click();
    await expect(page.getByRole("status")).toContainText(/check your email/i);
    await expect.poll(() => sink.linksFor(email).length).toBe(2);
    const [first, second] = sink.linksFor(email);
    expect(second).not.toBe(first);

    await page.goto(first);
    await page.getByRole("button", { name: "Verify my email" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /expired or already used/i })).toBeVisible();

    // The new link verifies, signs them in, and opens their board. Opening the page alone spends nothing.
    await page.goto(second);
    await expect(page.getByRole("button", { name: "Verify my email" })).toBeEnabled();
    await page.getByRole("button", { name: "Verify my email" }).click();
    await expect(page).toHaveURL(BOARD_URL);

    const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.termsAcceptedAt).not.toBeNull();

    // The link is single use, and a verified creator can now sign in with their password.
    await page.context().clearCookies();
    await page.goto(second);
    await page.getByRole("button", { name: "Verify my email" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /expired or already used/i })).toBeVisible();
    await signIn(page, email, "correct-horse-9");
  });

  test("says when an email already has an account", async ({ page }) => {
    await fillSignup(page, SEEDED.email);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /already exists/i })).toBeVisible();
    expect(sink.linksFor(SEEDED.email)).toHaveLength(0);
  });

  test("explains mistakes before sending anything", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => r.url().includes("/api/signup") && requests.push(r.url()));

    await fillSignup(page, newEmail(), { confirm: "something-else-9" });
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /do not match/i })).toBeVisible();

    await page.getByLabel("Confirm password").fill("correct-horse-9");
    await page.getByRole("checkbox", { name: /agree/i }).uncheck();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /accept the terms/i })).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("a signed-in creator is sent to their board instead", async ({ page }) => {
    await signIn(page);
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/board/);
  });

  test("a verification page without a token explains itself", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(page.getByText(/missing its token/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Verify my email" })).toHaveCount(0);
  });
});

test.describe("Terms and Privacy", () => {
  test("open without signing in and are linked from the form", async ({ page }) => {
    await page.goto("/signup");
    const terms = page.getByRole("link", { name: "Terms" });
    await expect(terms).toHaveAttribute("href", "/terms");
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Terms" })).toBeVisible();
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  });
});

test.describe("Continue with Google", () => {
  for (const path of ["/signin", "/signup"]) {
    test(`on ${path} sends the creator to Google with our callback`, async ({ page }) => {
      let googleUrl: URL | null = null;
      await page.route("https://accounts.google.com/**", async (route) => {
        googleUrl = new URL(route.request().url());
        await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Google</h1>" });
      });

      await page.goto(path);
      await page.getByRole("button", { name: /continue with google/i }).click();
      await expect.poll(() => googleUrl?.hostname).toBe("accounts.google.com");
      expect(googleUrl!.searchParams.get("client_id")).toBe("e2e-google-client-id.apps.googleusercontent.com");
      expect(googleUrl!.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/callback\/google$/);
      expect(googleUrl!.searchParams.get("scope")).toContain("email");
    });
  }

  test("explains a refused Google sign-in on the sign-in page", async ({ page }) => {
    await page.goto("/signin?error=google_unverified");
    await expect(page.getByRole("alert").filter({ hasText: /google has not verified/i })).toBeVisible();
  });
});
