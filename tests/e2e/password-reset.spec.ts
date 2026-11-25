import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { BOARD_URL, createUser, deleteUser, signIn, testDb } from "./helpers";
import { startMailSink } from "./mail-sink";

// DIG-107: forgot password, through the real pages and the real message.
const RUN = randomUUID().slice(0, 8);
const NEW_PASSWORD = "brand-new-pass-9";

let sink: Awaited<ReturnType<typeof startMailSink>>;
const created: string[] = [];
test.beforeAll(async () => {
  sink = await startMailSink();
});
test.afterAll(async () => {
  await sink.close();
  for (const id of created) await deleteUser(id);
});

async function newUser() {
  const user = await createUser();
  created.push(user.id);
  return user;
}

async function askForLink(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
}
const SENT = "If that address has an account, we sent a link.";
/** Next adds its own empty `role="alert"` route announcer, so find ours by what it says. */
const alert = (page: Page, text: string | RegExp) => page.getByRole("alert").filter({ hasText: text });

test("forgot password: from sign-in to a new password, signed in, with the old sessions signed out", async ({ browser, baseURL }) => {
  const user = await newUser();

  // An older session, as a stolen one would be: it must not survive the reset.
  const old = await browser.newContext({ baseURL });
  const oldPage = await old.newPage();
  await signIn(oldPage, user.email, user.password);

  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await page.goto("/signin");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: /forgot your password/i })).toBeVisible();

  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toHaveText(SENT);

  await expect.poll(() => sink.resetLinksFor(user.email).length).toBe(1);
  const message = sink.mailTo(user.email)[0];
  expect(message.subject).toMatch(/reset/i);
  expect(message.text).toMatch(/one hour/i);
  const link = sink.resetLinksFor(user.email)[0];

  // Opening the link spends nothing.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: /choose a new password/i })).toBeVisible();
  expect(await testDb.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new password").fill("something-else-1");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(alert(page, /do not match/i)).toBeVisible();
  expect(await testDb.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

  await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page).toHaveURL(BOARD_URL);

  // The old session is signed out; the one the reset just made is not.
  await oldPage.goto("/board");
  await expect(oldPage).toHaveURL(/\/signin/);
  await page.goto("/board");
  await expect(page).toHaveURL(BOARD_URL);

  // The old password no longer works and the new one does.
  const fresh = await browser.newContext({ baseURL });
  const freshPage = await fresh.newPage();
  await freshPage.goto("/signin");
  await freshPage.getByLabel("Studio Email").fill(user.email);
  await freshPage.getByLabel("Password", { exact: true }).fill(user.password);
  await freshPage.getByRole("button", { name: /sign in to studio/i }).click();
  await expect(alert(freshPage, /did not match/i)).toBeVisible();
  await freshPage.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await freshPage.getByRole("button", { name: /sign in to studio/i }).click();
  await expect(freshPage).toHaveURL(BOARD_URL);

  // The link works once.
  const again = await browser.newContext({ baseURL });
  const againPage = await again.newPage();
  await againPage.goto(link);
  await againPage.getByLabel("New password", { exact: true }).fill("a-different-pass-3");
  await againPage.getByLabel("Confirm new password").fill("a-different-pass-3");
  await againPage.getByRole("button", { name: "Set new password" }).click();
  await expect(alert(againPage, "expired or already used")).toBeVisible();
  await expect(againPage.getByRole("link", { name: /ask for a new link/i })).toHaveAttribute("href", "/forgot-password");
  expect(await bcrypt.compare(NEW_PASSWORD, (await testDb.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash!)).toBe(true);

  for (const c of [old, ctx, fresh, again]) await c.close();
});

test("an address with no account, a Google-only account, and a real one all get the same page", async ({ page }) => {
  const google = `google-${RUN}@test.local`;
  const googleUser = await testDb.user.create({
    data: { email: google, name: "G", googleId: `g-${RUN}`, emailVerifiedAt: new Date() },
  });
  created.push(googleUser.id);
  const real = await newUser();
  const unknown = `nobody-${RUN}@test.local`;

  const pages: string[] = [];
  for (const email of [unknown, google, real.email]) {
    await askForLink(page, email);
    await expect(page.getByRole("status")).toHaveText(SENT);
    pages.push(await page.locator("main").innerText());
  }
  expect(new Set(pages.map((p) => p.replace(/\s+/g, " "))).size).toBe(1);

  await expect.poll(() => sink.mailTo(real.email).length).toBe(1);
  await expect.poll(() => sink.mailTo(google).length).toBe(1);
  expect(sink.resetLinksFor(real.email)).toHaveLength(1);
  expect(sink.resetLinksFor(google)).toHaveLength(0);
  expect(sink.mailTo(google)[0].text).toMatch(/sign in with google/i);
  expect(sink.mailTo(unknown)).toHaveLength(0);
});

test("an expired link and a link with no token explain themselves and offer a new one", async ({ page }) => {
  const user = await newUser();
  await askForLink(page, user.email);
  await expect.poll(() => sink.resetLinksFor(user.email).length).toBe(1);
  await testDb.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

  await page.goto(sink.resetLinksFor(user.email)[0]);
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(alert(page, "expired or already used")).toBeVisible();
  expect(await bcrypt.compare(user.password, (await testDb.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash!)).toBe(true);

  await page.goto("/reset-password");
  await expect(page.getByText(/missing its token/i)).toBeVisible();
  await page.getByRole("link", { name: /ask for a new link/i }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("the reset pages stay out of search results and keep the link out of referrers", async ({ request }) => {
  for (const path of ["/forgot-password", "/reset-password?token=abc"]) {
    const html = await (await request.get(path)).text();
    expect(html, path).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  }
  const reset = await (await request.get("/reset-password?token=abc")).text();
  expect(reset).toMatch(/<meta name="referrer" content="no-referrer"/);
});

test("a creator who is already signed in can still open the forgot-password page", async ({ page }) => {
  const user = await newUser();
  await signIn(page, user.email, user.password);
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: /forgot your password/i })).toBeVisible();
});
