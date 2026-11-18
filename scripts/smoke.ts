/**
 * Smoke-checks a running Digital Zine against its real database and captures the README
 * screenshots. It never touches existing accounts: it creates a throwaway creator with four
 * photos and a published zine, runs every check as that creator, then deletes the creator and
 * their files.
 *
 *   npm run build && npm start            # or any running server on the same database and storage
 *   SMOKE_BASE_URL=http://localhost:3000 npm run smoke
 *
 * Needs the seed images in LOCAL_STORAGE_DIR/seed/ (`npm run db:seed` writes them).
 * Set SMOKE_SCREENSHOTS=0 to skip writing docs/screenshots/.
 */
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { chromium, expect, type Page } from "@playwright/test";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env: rely on the environment.
}

const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const SHOTS = process.env.SMOKE_SCREENSHOTS !== "0";
const OUT = path.resolve("docs/screenshots");
const STORAGE = path.resolve(process.env.LOCAL_STORAGE_DIR?.trim() || ".data/uploads");
const SMOKE_DOMAIN = "smoke.digitalzine.local";
const prisma = new PrismaClient();

const PLATES: {
  seed: string;
  name: string;
  caption: string;
  flip: boolean;
  exif: Prisma.InputJsonValue;
  recipe?: Prisma.InputJsonValue;
}[] = [
  {
    seed: "plate-01-charred-persimmon.jpg",
    name: "charred-persimmon.jpg",
    caption: "Late-afternoon sun across cast iron: blistered persimmons over cold cultured butter.",
    flip: true,
    exif: { iso: 400, aperture: "f/2.8", shutterSpeed: "1/250s", focalLength: "50mm", cameraMake: "Fujifilm", cameraModel: "GFX 50S II" },
    recipe: {
      title: "Charred Persimmon & Brown-Butter Brioche",
      servings: "2 plates",
      prepTime: "18 mins",
      ingredients: ["2 ripe Fuyu persimmons", "2 slices brioche", "60g cultured butter", "1 tbsp honey", "Flaky salt"],
      method: ["Sear the persimmons in a smoking-hot pan.", "Toast the brioche in brown butter.", "Butter, shingle the fruit, and finish with honey and salt."],
    },
  },
  {
    seed: "plate-02-morning-cellar.jpg",
    name: "morning-cellar.jpg",
    caption: "Morning light in the cellar, jars lined up for the long winter.",
    flip: true,
    exif: { iso: 800, aperture: "f/4", shutterSpeed: "1/60s", focalLength: "35mm", cameraMake: "Leica", cameraModel: "Q3" },
  },
  {
    seed: "plate-03-smoked-chili-oil.jpg",
    name: "smoked-chili-oil.jpg",
    caption: "Smoked chili oil, still warm.",
    flip: true,
    exif: { iso: 200, aperture: "f/5.6", shutterSpeed: "1/125s", focalLength: "90mm", cameraMake: "Sony", cameraModel: "A7R V" },
  },
  {
    seed: "plate-04-closing-linen.jpg",
    name: "closing-linen.jpg",
    caption: "Linen folded at the end of service.",
    flip: false,
    exif: { iso: 100, aperture: "f/8", shutterSpeed: "1/500s", focalLength: "28mm", cameraMake: "Ricoh", cameraModel: "GR IIIx" },
  },
];

/** Removes smoke users left behind by an interrupted run. */
async function removeSmokeUsers() {
  const stale = await prisma.user.findMany({ where: { email: { endsWith: `@${SMOKE_DOMAIN}` } }, select: { id: true } });
  for (const { id } of stale) {
    await prisma.user.delete({ where: { id } });
    await fs.rm(path.join(STORAGE, "users", id), { recursive: true, force: true });
  }
}

async function createSmokeCreator() {
  const password = randomBytes(18).toString("base64url");
  const user = await prisma.user.create({
    data: {
      email: `smoke-${randomUUID().slice(0, 8)}@${SMOKE_DOMAIN}`,
      name: "Folio Demo",
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  const assetIds: string[] = [];
  for (const [i, plate] of PLATES.entries()) {
    const storageKey = `users/${user.id}/${randomUUID()}-${plate.name}`;
    const target = path.join(STORAGE, storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(STORAGE, "seed", plate.seed), target);
    const asset = await prisma.mediaAsset.create({
      data: {
        ownerId: user.id,
        storageKey,
        publicUrl: `/api/media/${storageKey.split("/").map(encodeURIComponent).join("/")}`,
        originalName: plate.name,
        kind: plate.recipe ? "recipe" : "photo",
        exif: plate.exif,
        recipe: plate.recipe,
        sortOrder: i,
      },
    });
    assetIds.push(asset.id);
  }
  const zine = await prisma.zine.create({
    data: {
      ownerId: user.id,
      title: "Late Autumn Pantry",
      description: "Field notes, medium-format exposures, and pantry recipes from the studio kitchen.",
      slug: `late-autumn-pantry-${randomUUID().slice(0, 6)}`,
      published: true,
      publishedAt: new Date(),
      pages: {
        create: PLATES.map((plate, i) => ({
          pageNumber: i + 1,
          content: { assetId: assetIds[i], caption: plate.caption },
          flipEnabled: plate.flip,
        })),
      },
    },
  });
  return { user, password, zine };
}

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
  // Only images in the viewport: lazy images below the fold never load, so waiting on them hangs.
  await page.evaluate(() => {
    const visible = Array.from(document.images).filter((img) => {
      const r = img.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    });
    const decoded = Promise.all(visible.map((img) => img.decode().catch(() => undefined)));
    return Promise.race([decoded, new Promise((resolve) => setTimeout(resolve, 5000))]);
  });
  await page.screenshot({ path: path.join(OUT, file) });
  console.log(`    saved docs/screenshots/${file}`);
}

async function main() {
  console.log(`Smoke-checking ${BASE}`);
  if (SHOTS) await fs.mkdir(OUT, { recursive: true });
  await removeSmokeUsers();
  const { user: creator, password, zine } = await createSmokeCreator();
  const ZINE_SLUG = zine.slug;
  try {
    await runChecks(creator.email, password, ZINE_SLUG);
  } finally {
    await removeSmokeUsers();
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
  process.exit(failed.length ? 1 : 0);
}

async function runChecks(email: string, password: string, ZINE_SLUG: string) {

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

  await check("sign-in", async () => {
    await page.goto("/signin");
    await page.getByLabel("Studio Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in to studio/i }).click();
    await expect(page).toHaveURL(/\/board$/);
  });

  await check("Vision Board shows the creator's photos", async () => {
    const cards = page.getByRole("list", { name: "Vision Board photos" }).getByRole("listitem");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
    await shot(page, "vision-board.png");
  });

  let editorUrl = "";
  await check("editor lists and opens the zine", async () => {
    await page.goto("/editor");
    await page.getByRole("list", { name: "Zines" }).getByRole("link", { name: /Late Autumn Pantry/ }).click();
    await expect(page).toHaveURL(/\/editor\/[a-z0-9]+$/);
    editorUrl = page.url();
    await expect(page.getByRole("heading", { level: 1, name: "Late Autumn Pantry" })).toBeVisible();
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
    await expect(viewer.getByRole("heading", { level: 1, name: "Late Autumn Pantry" })).toBeVisible();
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
