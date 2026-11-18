import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { getAuthenticatedUser } from "@/lib/auth";

type SessionUser = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;

/** A throwaway user for one test file. Deleting it cascades to its assets and zines. */
export async function createTestUser(): Promise<SessionUser> {
  const user = await prisma.user.create({
    data: { email: `api-${randomUUID()}@test.local`, name: "API Test", passwordHash: "not-used" },
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

export async function createAsset(ownerId: string, sortOrder: number, name = `photo-${sortOrder}.jpg`) {
  const storageKey = `users/${ownerId}/${randomUUID()}-${name}`;
  return prisma.mediaAsset.create({
    data: {
      ownerId,
      storageKey,
      publicUrl: `/api/media/${storageKey}`,
      originalName: name,
      sortOrder,
      exif: { iso: 200 } as Prisma.InputJsonValue,
    },
  });
}

export async function createZineUsing(ownerId: string, assetId: string, title = "Test Zine") {
  return prisma.zine.create({
    data: {
      ownerId,
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
