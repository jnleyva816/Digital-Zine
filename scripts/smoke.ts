/**
 * Smoke-checks a running Digital Zine against its real database and captures the README
 * screenshots. It uses the seeded creator and the seeded zine, and changes no data.
 *
 *   npm run db:setup                      # once, so the seeded creator and zine exist
 *   npm run build && npm start            # or any running server
 *   SMOKE_BASE_URL=http://localhost:3000 npm run smoke
 *
 * Set SMOKE_SCREENSHOTS=0 to skip writing docs/screenshots/.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, expect, type Page } from "@playwright/test";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const SHOTS = process.env.SMOKE_SCREENSHOTS !== "0";
const OUT = path.resolve("docs/screenshots");
const SEEDED = { email: "creator@digitalzine.local", password: "zine1234" };
const ZINE_SLUG = "sunday-ferments-issue-01";

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  ✗ ${name}\n      ${detail}`);
  }
}

async function shot(page: Page, file: string) {
  if (!SHOTS) return;
  // Let images finish decoding so screenshots never show half-loaded photos.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => Promise.all(Array.from(document.images, (img) => img.decode().catch(() => undefined))));
  await page.screenshot({ path: path.join(OUT, file) });
  console.log(`    saved docs/screenshots/${file}`);
}

async function main() {
  console.log(`Smoke-checking ${BASE}`);
  if (SHOTS) await fs.mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  await check("signed-out visitors are sent to sign-in", async () => {
    const res = await context.request.get("/board", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toContain("/signin");
  });

  await check("sign-in with the seeded creator", async () => {
    await page.goto("/signin");
    await page.getByLabel("Studio Email").fill(SEEDED.email);
    await page.getByLabel("Password").fill(SEEDED.password);
    await page.getByRole("button", { name: /sign in to studio/i }).click();
    await expect(page).toHaveURL(/\/board$/);
  });

  await check("Vision Board shows the seeded photos", async () => {
    const cards = page.getByRole("list", { name: "Vision Board photos" }).getByRole("listitem");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
    await shot(page, "vision-board.png");
  });

  let editorUrl = "";
  await check("editor lists and opens the seeded zine", async () => {
    await page.goto("/editor");
    await page.getByRole("list", { name: "Zines" }).getByRole("link", { name: /Sunday Ferments/ }).click();
    await expect(page).toHaveURL(/\/editor\/[a-z0-9]+$/);
    editorUrl = page.url();
    await expect(page.getByRole("heading", { level: 1, name: /Sunday Ferments/ })).toBeVisible();
    await expect(page.getByRole("list", { name: "Pages" }).getByRole("listitem")).toHaveCount(4);
    await shot(page, "editor.png");
  });

  await check("PDF gate: a Free creator sees the upgrade link, and the API refuses", async () => {
    if (!editorUrl) throw new Error("editor did not open");
    await page.goto(editorUrl);
    await expect(page.getByText("PDF export is a Pro feature.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/billing");
    const res = await page.request.get(`/api/pdf/${ZINE_SLUG}`);
    expect(res.status()).toBe(403);
  });

  await check("billing explains when Stripe is not configured", async () => {
    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: "Your plan: Free" })).toBeVisible();
    const res = await page.request.post("/api/billing/checkout");
    if (res.status() === 503) {
      await expect(page.getByText(/Billing is not set up in this environment/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeDisabled();
    } else {
      // Stripe is configured here; checkout must hand back a Stripe URL.
      expect(res.status()).toBe(200);
      expect((await res.json()).url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    }
  });

  // Readers are signed out.
  const reader = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 860 } });
  const viewer = await reader.newPage();

  await check("public viewer is server-rendered with Open Graph tags", async () => {
    const res = await reader.request.get(`/z/${ZINE_SLUG}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    for (const tag of ["og:title", "og:description", "og:image"]) {
      expect(html, `missing ${tag}`).toMatch(new RegExp(`<meta[^>]*property="${tag}"[^>]*content="[^"]+"`));
    }
  });

  await check("public viewer flips cards for a signed-out reader", async () => {
    await viewer.goto(`/z/${ZINE_SLUG}`);
    await expect(viewer.getByRole("heading", { level: 1, name: /Sunday Ferments/ })).toBeVisible();
    await shot(viewer, "public-viewer.png");
    const flip = viewer.getByRole("button", { name: /^Page 1: flip/ });
    await flip.click();
    await expect(flip).toHaveAttribute("aria-pressed", "true");
    // Wait for the CSS flip transition to finish before the screenshot.
    await viewer.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    await flip.scrollIntoViewIfNeeded();
    await shot(viewer, "public-viewer-flipped.png");
  });

  await check("public viewer fits a phone", async () => {
    const phone = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p = await phone.newPage();
    await p.goto(`/z/${ZINE_SLUG}`);
    await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    await shot(p, "public-viewer-phone.png");
    await phone.close();
  });

  await check("unknown zines are a 404", async () => {
    expect((await reader.request.get("/z/no-such-zine-smoke")).status()).toBe(404);
  });

  await check("no console errors in the browser", async () => {
    // Prefetch 404s for unknown routes are not app errors.
    const real = consoleErrors.filter((e) => !/Failed to load resource: the server responded with a status of 404/.test(e));
    expect(real, real.join("\n")).toEqual([]);
  });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
