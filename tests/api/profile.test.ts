import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { PATCH } from "@/app/api/account/profile/route";
import { jsonRequest, resetRateLimits, sessionFor } from "./helpers";

// DIG-111: a creator sets their handle, display name, and bio.
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);
const created: string[] = [];
const TAG = randomUUID().replaceAll("-", "").slice(0, 8);
/** A handle unique to this run, so reruns against the same database never collide. */
const h = (word: string) => `${word}_${TAG}`;

beforeEach(async () => {
  await resetRateLimits();
  vi.mocked(revalidateTag).mockClear();
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

async function make(extra: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: { email: `profile-${TAG}-${randomUUID()}@test.local`, name: "Ana", passwordHash: "x", emailVerifiedAt: new Date(), ...extra },
  });
  created.push(user.id);
  return user;
}
const as = (user: Awaited<ReturnType<typeof make>>) => mockedUser.mockResolvedValue(sessionFor(user));
const patch = (body: unknown) => PATCH(jsonRequest("/api/account/profile", "PATCH", body));
const handlesOf = async (userId: string) =>
  (await prisma.userHandle.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map((r) => r.handle);

describe("PATCH /api/account/profile", () => {
  it("returns 401 signed out and changes nothing", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await patch({ handle: h("nobody") })).status).toBe(401);
    expect(await prisma.userHandle.findUnique({ where: { handle: h("nobody") } })).toBeNull();
  });

  it("sets a handle in any case, stores it lowercase, and never sends the email back", async () => {
    const user = await make();
    as(user);
    const res = await patch({ handle: `@${h("Film_Lover").toUpperCase()}`, name: "  Ana Ruiz ", bio: "Classic Neg on the X100V.\nTokyo." });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ profile: { handle: h("film_lover"), name: "Ana Ruiz", bio: "Classic Neg on the X100V.\nTokyo." } });
    expect(JSON.stringify(body)).not.toContain(user.email);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ handle: h("film_lover"), name: "Ana Ruiz", bio: "Classic Neg on the X100V.\nTokyo." });
    expect(await handlesOf(user.id)).toEqual([h("film_lover")]);
  });

  it("refuses invalid and reserved handles with 400 and a code", async () => {
    as(await make());
    const bad = await patch({ handle: "a b" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "handle_invalid" });
    const reserved = await patch({ handle: "Admin" });
    expect(reserved.status).toBe(400);
    expect(await reserved.json()).toMatchObject({ code: "handle_reserved" });
  });

  it("refuses a bio over 160 characters, a name over 80, control characters, wrong types, and bad JSON", async () => {
    const user = await make();
    as(user);
    for (const body of [{ bio: "x".repeat(161) }, { name: "x".repeat(81) }, { bio: "hi\u0000there" }, { name: "a‮b" }, { bio: 5 }, { handle: ["x"] }, "{not json", [1]]) {
      const res = await patch(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await res.json()).toMatchObject({ code: expect.any(String), error: expect.any(String) });
    }
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ name: "Ana", bio: null, handle: null });
  });

  it("clears the name and bio when sent empty, and leaves fields that were not sent alone", async () => {
    const user = await make({ bio: "Old bio" });
    as(user);
    expect((await patch({ handle: h("keepme") })).status).toBe(200);
    const res = await patch({ name: "  ", bio: "" });
    expect(await res.json()).toEqual({ profile: { handle: h("keepme"), name: null, bio: null } });
  });

  it("refuses with 409 a handle another account has now, in any case", async () => {
    const owner = await make();
    as(owner);
    await patch({ handle: h("taken") });
    as(await make());
    const res = await patch({ handle: h("TAKEN") });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "handle_taken" });
  });

  it("keeps an old handle for its creator after a rename: nobody else can take it, and they can take it back", async () => {
    const first = await make();
    as(first);
    await patch({ handle: h("oldname") });
    expect((await patch({ handle: h("newname") })).status).toBe(200);
    expect(await handlesOf(first.id)).toEqual([h("oldname"), h("newname")]);

    as(await make());
    const res = await patch({ handle: h("oldname") });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "handle_taken" });

    as(first);
    expect(await (await patch({ handle: h("oldname") })).json()).toMatchObject({ profile: { handle: h("oldname") } });
    expect(await handlesOf(first.id)).toEqual([h("oldname"), h("newname")]);
  });

  it("allows 5 handles per account and refuses a sixth with 409, though old ones can still be reused", async () => {
    const user = await make();
    as(user);
    for (const n of [1, 2, 3, 4, 5]) expect((await patch({ handle: h(`n${n}`) })).status).toBe(200);
    const res = await patch({ handle: h("n6") });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "handle_limit" });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ handle: h("n5") });
    expect((await patch({ handle: h("n2") })).status).toBe(200);
  });

  it("gives a handle to exactly one of two accounts that claim it at the same moment", async () => {
    const [a, b] = await Promise.all([make(), make()]);
    const claim = (user: typeof a) => {
      mockedUser.mockResolvedValueOnce(sessionFor(user));
      return patch({ handle: h("race") });
    };
    const statuses = (await Promise.all([claim(a), claim(b)])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(await prisma.user.count({ where: { handle: h("race") } })).toBe(1);
  });

  it("stops one account claiming more than 5 handles even when the renames arrive together", async () => {
    const user = await make();
    const renames = [1, 2, 3, 4, 5, 6, 7].map((n) => {
      mockedUser.mockResolvedValueOnce(sessionFor(user));
      return patch({ handle: h(`burst${n}`) });
    });
    const statuses = (await Promise.all(renames)).map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(await handlesOf(user.id)).toHaveLength(5);
  });

  it("refreshes the creator's published zine pages, whose byline shows the name and links the handle", async () => {
    const user = await make();
    const board = await prisma.board.create({ data: { ownerId: user.id, name: "B" } });
    await prisma.zine.create({ data: { ownerId: user.id, boardId: board.id, title: "Live", slug: "live", published: true, publishedAt: new Date() } });
    await prisma.zine.create({ data: { ownerId: user.id, boardId: board.id, title: "Draft", slug: "draft" } });
    as(user);
    await patch({ name: "New Name" });
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(`public-zine:${user.publicId}/live`);
    expect(vi.mocked(revalidateTag)).not.toHaveBeenCalledWith(`public-zine:${user.publicId}/draft`);
  });

  it("is rate limited with the creator's other edits", async () => {
    as(await make());
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await patch({ bio: 1 })).status;
    expect(last).toBe(429);
  });
});
