import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { legacyZineAddress } from "@/lib/legacy-zine-url";
import { createTestUser, defaultBoardId, deleteTestUser } from "./helpers";

// DIG-102: /z/<slug> links shared before creators were in the address keep working.
let a: Awaited<ReturnType<typeof createTestUser>>;
let b: Awaited<ReturnType<typeof createTestUser>>;

beforeAll(async () => {
  a = await createTestUser();
  b = await createTestUser();
});
afterAll(async () => {
  await deleteTestUser(a.id);
  await deleteTestUser(b.id);
  await prisma.$disconnect();
});

async function zine(owner: typeof a, slug: string, over: { published?: boolean; createdAt?: Date } = {}) {
  return prisma.zine.create({
    data: {
      ownerId: owner.id,
      boardId: await defaultBoardId(owner.id),
      title: slug,
      slug,
      published: over.published ?? true,
      publishedAt: over.published === false ? null : new Date(),
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    },
  });
}

describe("legacyZineAddress", () => {
  it("finds the creator of a published zine by its old slug", async () => {
    const slug = `old-${randomUUID().slice(0, 8)}`;
    await zine(a, slug);
    expect(await legacyZineAddress(slug)).toEqual({ owner: a.publicId, slug });
  });

  it("is null for an unknown slug and for one that is not published", async () => {
    expect(await legacyZineAddress(`nope-${randomUUID().slice(0, 8)}`)).toBeNull();
    const draft = `draft-${randomUUID().slice(0, 8)}`;
    await zine(a, draft, { published: false });
    expect(await legacyZineAddress(draft)).toBeNull();
  });

  it("when creators now share a slug, goes to the oldest published one, which held it when slugs were global", async () => {
    const slug = `shared-${randomUUID().slice(0, 8)}`;
    await zine(b, slug, { createdAt: new Date("2026-11-20T10:00:00Z") });
    await zine(a, slug, { createdAt: new Date("2026-11-01T10:00:00Z") });
    expect((await legacyZineAddress(slug))?.owner).toBe(a.publicId);
  });

  it("skips an older zine that is not published", async () => {
    const slug = `skip-${randomUUID().slice(0, 8)}`;
    await zine(a, slug, { published: false, createdAt: new Date("2026-11-01T10:00:00Z") });
    await zine(b, slug, { createdAt: new Date("2026-11-20T10:00:00Z") });
    expect((await legacyZineAddress(slug))?.owner).toBe(b.publicId);
  });
});
