import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPublicProfile } from "@/lib/public-profile";
import { getPublicZine } from "@/lib/public-zine";

// DIG-111: the public profile at /u/<handle>.
const created: string[] = [];
const TAG = randomUUID().replaceAll("-", "").slice(0, 8);
const h = (word: string) => `${word}_${TAG}`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

async function creator(handle: string | null, extra: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: {
      email: `pub-${TAG}-${randomUUID()}@test.local`,
      name: "Ana Ruiz",
      bio: "Classic Neg, mostly.",
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      handle,
      ...(handle ? { handles: { create: [{ handle }] } } : {}),
      ...extra,
    },
  });
  created.push(user.id);
  const board = await prisma.board.create({ data: { ownerId: user.id, name: "B" } });
  return { user, board };
}

async function zine(
  owner: { user: { id: string }; board: { id: string } },
  slug: string,
  opts: { published?: boolean; publishedAt?: Date; photo?: "ready" | "processing" | "none" } = {}
) {
  const { published = true, publishedAt = new Date(), photo = "ready" } = opts;
  const asset =
    photo === "none"
      ? null
      : await prisma.mediaAsset.create({
          data: {
            ownerId: owner.user.id,
            boardId: owner.board.id,
            storageKey: `users/${owner.user.id}/${randomUUID()}.jpg`,
            publicUrl: `/api/media/users/${owner.user.id}/${slug}.jpg`,
            originalName: "DSCF0001.JPG",
            sortOrder: 0,
            status: photo,
            width: 3000,
            height: 2000,
          },
        });
  return prisma.zine.create({
    data: {
      ownerId: owner.user.id,
      boardId: owner.board.id,
      title: `Title ${slug}`,
      description: `Secret draft notes ${slug}`,
      slug,
      published,
      publishedAt: published ? publishedAt : null,
      pages: asset ? { create: [{ pageNumber: 1, content: { assetId: asset.id, caption: `caption ${slug}` } }] } : undefined,
    },
  });
}

describe("getPublicProfile", () => {
  it("shows the name, bio, and published zines newest first, with their addresses and covers", async () => {
    const ana = await creator(h("ana"));
    await zine(ana, "older", { publishedAt: new Date("2026-01-01") });
    await zine(ana, "newer", { publishedAt: new Date("2026-06-01") });
    const result = await getPublicProfile(h("ana"));
    expect(result?.kind).toBe("profile");
    if (result?.kind !== "profile") return;
    expect(result.profile).toMatchObject({ handle: h("ana"), name: "Ana Ruiz", bio: "Classic Neg, mostly." });
    expect(result.profile.zines.map((z) => z.path)).toEqual([`/z/${ana.user.publicId}/newer`, `/z/${ana.user.publicId}/older`]);
    expect(result.profile.zines[0]).toMatchObject({ title: "Title newer", pageCount: 1, cover: { imageUrl: expect.stringContaining("newer.jpg") } });
  });

  it("finds the profile in any case", async () => {
    await creator(h("casey"));
    expect((await getPublicProfile(h("CASEY")))?.kind).toBe("profile");
    expect((await getPublicProfile(`@${h("casey")}`))?.kind).toBe("profile");
  });

  it("never includes drafts, the email, or zines by anyone else", async () => {
    const ana = await creator(h("private"));
    const other = await creator(h("other"));
    await zine(ana, "draft", { published: false });
    await zine(ana, "live");
    await zine(other, "theirs");
    const result = await getPublicProfile(h("private"));
    if (result?.kind !== "profile") throw new Error("expected a profile");
    expect(result.profile.zines.map((z) => z.title)).toEqual(["Title live"]);
    const sent = JSON.stringify(result);
    expect(sent).not.toContain(ana.user.email);
    expect(sent).not.toContain("draft");
    expect(sent).not.toContain("theirs");
    expect(sent).not.toContain(ana.user.id);
  });

  it("gives no cover for a photo that is still processing, which would still carry its EXIF", async () => {
    const ana = await creator(h("processing"));
    await zine(ana, "fresh", { photo: "processing" });
    const result = await getPublicProfile(h("processing"));
    if (result?.kind !== "profile") throw new Error("expected a profile");
    expect(result.profile.zines[0].cover).toBeNull();
  });

  it("redirects an old handle to the current one", async () => {
    const ana = await creator(h("current"));
    await prisma.userHandle.create({ data: { handle: h("previous"), userId: ana.user.id } });
    expect(await getPublicProfile(h("previous"))).toEqual({ kind: "redirect", handle: h("current") });
  });

  it("is not found for an unknown handle, an invalid one, or a deactivated creator", async () => {
    expect(await getPublicProfile(h("nobody"))).toBeNull();
    expect(await getPublicProfile("../admin")).toBeNull();
    await creator(h("gone"), { deactivatedAt: new Date() });
    expect(await getPublicProfile(h("gone"))).toBeNull();
    const old = await creator(h("gonenow"), { deactivatedAt: new Date() });
    await prisma.userHandle.create({ data: { handle: h("gonebefore"), userId: old.user.id } });
    expect(await getPublicProfile(h("gonebefore"))).toBeNull();
  });
});

describe("getPublicZine byline", () => {
  it("carries the creator's handle, so the byline can link the profile, and null without one", async () => {
    const ana = await creator(h("byline"));
    await zine(ana, "with-handle");
    expect(await getPublicZine(ana.user.publicId, "with-handle")).toMatchObject({ ownerName: "Ana Ruiz", ownerHandle: h("byline") });
    const anon = await creator(null);
    await zine(anon, "no-handle");
    expect(await getPublicZine(anon.user.publicId, "no-handle")).toMatchObject({ ownerHandle: null });
  });
});
