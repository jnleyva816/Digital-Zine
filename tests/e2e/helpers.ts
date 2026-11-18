import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, type Page } from "@playwright/test";
import { loadTestEnv } from "../../scripts/test-db";

export const SEEDED = { email: "creator@digitalzine.local", password: "zine1234" } as const;

/** Prisma client bound to the test database, for arranging data the UI cannot create. */
const testEnv = loadTestEnv();
export const testDb = new PrismaClient({ datasourceUrl: testEnv.DATABASE_URL });
/** Where the test server keeps uploaded files. */
const storageRoot = path.resolve(testEnv.LOCAL_STORAGE_DIR);

export async function signIn(page: Page, email: string = SEEDED.email, password: string = SEEDED.password) {
  await page.goto("/signin");
  await page.getByLabel("Studio Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in to studio/i }).click();
  await expect(page).toHaveURL("/board");
}

export async function createUser(password = "test-pass-123") {
  const email = `e2e-${randomUUID()}@test.local`;
  const user = await testDb.user.create({
    data: { email, name: "E2E", passwordHash: await bcrypt.hash(password, 4) },
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
