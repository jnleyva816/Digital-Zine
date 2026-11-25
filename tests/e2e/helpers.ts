import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, type Page } from "@playwright/test";
import { loadTestEnv } from "../../scripts/test-db";
import { getOrCreateDefaultBoard } from "../../src/lib/boards";

export const SEEDED = { email: "creator@digitalzine.local", password: "zine1234" } as const;

/** One Vision Board's page. `/board` redirects to the creator's first board (DIG-25). */
export const BOARD_URL = /\/boards\/[a-z0-9-]+$/;

/** Prisma client bound to the test database, for arranging data the UI cannot create. */
const testEnv = loadTestEnv();
export const testDb = new PrismaClient({ datasourceUrl: testEnv.DATABASE_URL });
/** Where the test server keeps uploaded files. */
const storageRoot = path.resolve(testEnv.LOCAL_STORAGE_DIR);

/** The creator's first board, made on demand, as the app does (DIG-25). */
export async function defaultBoardId(userId: string) {
  return (await getOrCreateDefaultBoard(userId, testDb)).id;
}

export async function signIn(page: Page, email: string = SEEDED.email, password: string = SEEDED.password) {
  await page.goto("/signin");
  await page.getByLabel("Studio Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in to studio/i }).click();
  await expect(page).toHaveURL(BOARD_URL);
}

export async function createUser(password = "test-pass-123") {
  const email = `e2e-${randomUUID()}@test.local`;
  const user = await testDb.user.create({
    data: { email, name: "E2E", passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date() },
  });
  return { ...user, password };
}

/** Board cards, in display order. */
export const boardCards = (page: Page) => page.getByRole("list", { name: "Vision Board photos" }).getByRole("listitem");

export function waitForReorder(page: Page) {
  return page.waitForResponse((r) => r.url().endsWith("/api/assets/reorder") && r.request().method() === "POST");
}

const SEED_IMAGES = [
  "seed/plate-01-harbor-dusk.jpg",
  "seed/plate-02-morning-fog.jpg",
  "seed/plate-03-neon-alley.jpg",
];

/**
 * A new creator whose board holds three photos. Each photo is a copy of a seeded image stored
 * under the creator's own key, as a real upload would be.
 */
export async function createUserWithPhotos(names = ["persimmon.jpg", "cellar.jpg", "chili.jpg"]) {
  const user = await createUser();
  const assets = [];
  for (const [i, name] of names.entries()) {
    const storageKey = `users/${user.id}/${randomUUID()}-${name}`;
    const target = path.join(storageRoot, storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(storageRoot, SEED_IMAGES[i % SEED_IMAGES.length]), target);
    assets.push(
      await testDb.mediaAsset.create({
        data: {
          ownerId: user.id,
          boardId: await defaultBoardId(user.id),
          storageKey,
          publicUrl: `/api/media/${storageKey}`,
          originalName: name,
          sortOrder: i,
          exif: { iso: 200 },
        },
      })
    );
  }
  return { user, assets };
}

export async function deleteUser(id: string) {
  await testDb.user.delete({ where: { id } }).catch(() => undefined);
  await fs.rm(path.join(storageRoot, "users", id), { recursive: true, force: true });
}

export async function makePro(id: string) {
  await testDb.user.update({ where: { id }, data: { tier: "pro", subscriptionStatus: "active" } });
}

/** A plain landscape JPEG, wide enough that the processed copies include 480, 960, and 1600 px. */
export async function wideJpeg(width = 2400, height = 1600) {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width, height, channels: 3, background: { r: 40, g: 110, b: 170 } } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Uploads one photo on the board and waits until the worker has made its AVIF copies (DIG-26).
 * Returns the saved asset as the database has it once processing is done.
 */
export async function uploadAndProcess(page: Page, ownerId: string, name = "wide.jpg", width = 2400) {
  const buffer = await wideJpeg(width, Math.round((width * 2) / 3));
  await page.getByLabel("choose files").setInputFiles({ name, mimeType: "image/jpeg", buffer });
  await expect(page.getByRole("status").filter({ hasText: `Processing ${name}` })).toBeHidden({ timeout: 20_000 });
  await expect
    .poll(async () => (await testDb.mediaAsset.findFirst({ where: { ownerId, originalName: name } }))?.status, {
      timeout: 20_000,
    })
    .toBe("ready");
  return testDb.mediaAsset.findFirstOrThrow({ where: { ownerId, originalName: name } });
}

/** Whether a file exists in the test server's storage. */
export function storedFileExists(storageKey: string) {
  return fs.access(path.join(storageRoot, storageKey)).then(
    () => true,
    () => false
  );
}
