import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import sitemap from "@/app/sitemap";
import { publicZinePath } from "@/lib/public-zine-path";
import { createAsset, createTestUser, createZineUsing, deleteTestUser } from "./helpers";

// DIG-106: the sitemap lists exactly what search engines may index.
const SITE = "https://folio-digital-zine.app";

let user: Awaited<ReturnType<typeof createTestUser>>;
let assetId: string;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", SITE);
  user = await createTestUser();
  assetId = (await createAsset(user.id, 0)).id;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteTestUser(user.id);
  await prisma.$disconnect();
});

const urls = async () => (await sitemap()).map((e) => e.url);
const addressOf = (slug: string) => `${SITE}${publicZinePath(user.publicId, slug)}`;

async function publish(title: string, extra: { published?: boolean; publishedAt?: Date | null } = {}) {
  const zine = await createZineUsing(user.id, assetId, title);
  return prisma.zine.update({
    where: { id: zine.id },
    data: { published: extra.published ?? true, publishedAt: extra.publishedAt === undefined ? new Date() : extra.publishedAt },
  });
}

describe("sitemap", () => {
  it("lists the landing page and the legal pages", async () => {
    const all = await urls();
    expect(all).toContain(`${SITE}/`);
    expect(all).toContain(`${SITE}/terms`);
    expect(all).toContain(`${SITE}/privacy`);
  });

  it("lists a published zine at its public address with a last-modified date", async () => {
    const zine = await publish("Published one");
    const entry = (await sitemap()).find((e) => e.url === addressOf(zine.slug));
    expect(entry).toBeDefined();
    expect(new Date(entry!.lastModified as Date).getTime()).toBe(zine.updatedAt.getTime());
  });

  it("never lists a draft", async () => {
    const draft = await createZineUsing(user.id, assetId, "Still a draft");
    expect(await urls()).not.toContain(addressOf(draft.slug));
  });

  it("drops a zine the moment it is unpublished, even though it was published once", async () => {
    const zine = await publish("Soon gone");
    expect(await urls()).toContain(addressOf(zine.slug));
    await prisma.zine.update({ where: { id: zine.id }, data: { published: false } });
    expect(await urls()).not.toContain(addressOf(zine.slug));
  });

  it("follows a rename: the new address appears, the old one goes, and the date moves", async () => {
    const zine = await publish("Before");
    const before = (await sitemap()).find((e) => e.url === addressOf(zine.slug))!;
    await new Promise((r) => setTimeout(r, 15));
    const renamed = await prisma.zine.update({ where: { id: zine.id }, data: { slug: `renamed-${zine.slug}` } });

    const after = await sitemap();
    expect(after.map((e) => e.url)).not.toContain(addressOf(zine.slug));
    const entry = after.find((e) => e.url === addressOf(renamed.slug))!;
    expect(entry).toBeDefined();
    expect(new Date(entry.lastModified as Date).getTime()).toBeGreaterThan(new Date(before.lastModified as Date).getTime());
  });

  it("encodes a slug that is not path-safe the way the page address does", async () => {
    const zine = await publish("Odd slug");
    await prisma.zine.update({ where: { id: zine.id }, data: { slug: "a b" } });
    expect(await urls()).toContain(`${SITE}/z/${user.publicId}/a%20b`);
  });

  it("lists nothing private and nothing twice", async () => {
    const all = await urls();
    expect(new Set(all).size).toBe(all.length);
    for (const url of all) {
      expect(url).toMatch(/^https:\/\/folio-digital-zine\.app\/(?:$|terms$|privacy$|z\/[0-9a-f]{8}\/[^/]+$)/);
    }
  });
});
