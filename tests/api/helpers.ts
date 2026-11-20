import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBoard } from "@/lib/boards";
import type { getAuthenticatedUser } from "@/lib/auth";

type SessionUser = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;

/** A throwaway user for one test file. Deleting it cascades to its assets and zines. */
export async function createTestUser(): Promise<SessionUser> {
  const user = await prisma.user.create({
    data: { email: `api-${randomUUID()}@test.local`, name: "API Test", passwordHash: "not-used", emailVerifiedAt: new Date() },
  });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tier: user.tier,
    billingTier: user.tier,
    role: user.role,
    viewingAsFree: false,
    subscriptionStatus: user.subscriptionStatus,
    stripeCustomerId: user.stripeCustomerId,
  };
}

export async function deleteTestUser(id: string) {
  await prisma.user.delete({ where: { id } }).catch(() => undefined);
}

/** The owner's first board, made on demand (DIG-25). */
export async function defaultBoardId(ownerId: string) {
  return (await getOrCreateDefaultBoard(ownerId, prisma)).id;
}

export async function createBoard(ownerId: string, name: string, sortOrder = 1) {
  return prisma.board.create({ data: { ownerId, name, sortOrder } });
}

/** A photo on `boardId`, or on the owner's first board. */
export async function createAsset(
  ownerId: string,
  sortOrder: number,
  name = `photo-${sortOrder}.jpg`,
  boardId?: string
) {
  const storageKey = `users/${ownerId}/${randomUUID()}-${name}`;
  return prisma.mediaAsset.create({
    data: {
      ownerId,
      boardId: boardId ?? (await defaultBoardId(ownerId)),
      storageKey,
      publicUrl: `/api/media/${storageKey}`,
      originalName: name,
      sortOrder,
      exif: { iso: 200 } as Prisma.InputJsonValue,
    },
  });
}

/** One board photo that already takes up `sizeBytes` of the owner's storage (DIG-32). */
export async function createAssetOfSize(ownerId: string, sizeBytes: number) {
  const asset = await createAsset(ownerId, 0, "big.jpg");
  return prisma.mediaAsset.update({ where: { id: asset.id }, data: { sizeBytes } });
}

export async function createZineUsing(ownerId: string, assetId: string, title = "Test Zine", boardId?: string) {
  return prisma.zine.create({
    data: {
      ownerId,
      boardId: boardId ?? (await defaultBoardId(ownerId)),
      title,
      slug: `test-${randomUUID()}`,
      pages: { create: [{ pageNumber: 1, content: { assetId, caption: "" } }] },
    },
  });
}

export function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(`http://test.local${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const params = <T extends Record<string, unknown>>(value: T) => ({ params: Promise.resolve(value) });

/** A saved recipe in the owner's library (DIG-24). */
export async function createSavedRecipe(ownerId: string, name = "Kodachrome 64", settings: Record<string, unknown> = { filmSimulation: "Classic Chrome" }) {
  return prisma.recipe.create({ data: { ownerId, name, settings: settings as Prisma.InputJsonValue } });
}

/** Clears every rate-limit counter (DIG-28), so one test's requests never count against the next. */
export async function resetRateLimits() {
  await prisma.rateLimit.deleteMany({});
}
