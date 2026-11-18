import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, type Page } from "@playwright/test";
import { loadTestEnv } from "../../scripts/test-db";

export const SEEDED = { email: "creator@digitalzine.local", password: "zine1234" } as const;

/** Prisma client bound to the test database, for arranging data the UI cannot create. */
export const testDb = new PrismaClient({ datasourceUrl: loadTestEnv().DATABASE_URL });

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
