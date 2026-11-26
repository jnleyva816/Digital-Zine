import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { GET as LIST } from "@/app/api/admin/zines/route";
import { createAsset, createZineUsing, resetRateLimits, sessionFor } from "./helpers";

// DIG-138: admins see every zine; a private one shows that it exists, and nothing of what is in it.
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);
const created: string[] = [];

beforeEach(resetRateLimits);
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

async function make(role: "user" | "admin" = "user", extra: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: { email: `zines-${randomUUID()}@test.local`, name: "Zine Owner", role, passwordHash: "x", emailVerifiedAt: new Date(), ...extra },
  });
  created.push(user.id);
  return user;
}
type Account = Awaited<ReturnType<typeof make>>;

/** A zine with a secret title, description, and caption, published or not. */
async function zineOf(owner: Account, published: boolean, title = `Secret title ${randomUUID()}`) {
  const photo = await createAsset(owner.id, 0, "secret-file-name.jpg");
  const zine = await createZineUsing(owner.id, photo.id, title);
  return prisma.zine.update({
    where: { id: zine.id },
    data: {
      description: "secret description",
      published,
      publishedAt: published ? new Date() : null,
      pages: { updateMany: { where: {}, data: { content: { assetId: photo.id, caption: "secret caption" } } } },
    },
  });
}

const signIn = (user: Account) => mockedUser.mockResolvedValue(sessionFor(user));
const list = (query = "") => LIST(new Request(`http://test.local/api/admin/zines${query}`));

describe("GET /api/admin/zines", () => {
  it("returns 401 signed out and 403 to a regular user, with no zines in the body", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await list()).status).toBe(401);
    signIn(await make());
    const res = await list();
    expect(res.status).toBe(403);
    expect(await res.json()).not.toHaveProperty("zines");
  });

  it("sends a private zine's owner, dates, page count, and status, and nothing of what is in it", async () => {
    signIn(await make("admin"));
    const owner = await make();
    const zine = await zineOf(owner, false);
    const res = await list(`?owner=${owner.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const text = await res.clone().text();
    for (const secret of [zine.title, zine.slug, "secret description", "secret caption", "secret-file-name", "users/"]) expect(text).not.toContain(secret);
    expect(await res.json()).toEqual({
      zines: [
        {
          id: zine.id,
          status: "private",
          owner: { id: owner.id, email: owner.email },
          pageCount: 1,
          createdAt: zine.createdAt.toISOString(),
          updatedAt: zine.updatedAt.toISOString(),
        },
      ],
      nextCursor: null,
    });
  });

  it("treats a zine that was published and then taken down as private", async () => {
    signIn(await make("admin"));
    const owner = await make();
    const zine = await zineOf(owner, true);
    await prisma.zine.update({ where: { id: zine.id }, data: { published: false } });
    const body = await (await list(`?owner=${owner.id}`)).json();
    expect(body.zines[0]).not.toHaveProperty("title");
    expect(body.zines[0].status).toBe("private");
  });

  it("sends a public zine's title and address, and no address when its owner is deactivated", async () => {
    signIn(await make("admin"));
    const owner = await make();
    const zine = await zineOf(owner, true, "Harbor Notes");
    const shown = (await (await list(`?owner=${owner.id}`)).json()).zines[0];
    expect(shown).toEqual({
      id: zine.id,
      status: "public",
      title: "Harbor Notes",
      path: `/z/${owner.publicId}/${zine.slug}`,
      hidden: false,
      owner: { id: owner.id, email: owner.email },
      pageCount: 1,
      createdAt: zine.createdAt.toISOString(),
      updatedAt: zine.updatedAt.toISOString(),
    });
    expect(JSON.stringify(shown)).not.toContain("secret");
    await prisma.user.update({ where: { id: owner.id }, data: { deactivatedAt: new Date() } });
    expect((await (await list(`?owner=${owner.id}`)).json()).zines[0]).toMatchObject({ status: "public", path: null, hidden: true });
  });

  it("filters by status, and pages newest-changed first through every zine once", async () => {
    signIn(await make("admin"));
    const owner = await make();
    const ids = { public: [] as string[], private: [] as string[] };
    for (let i = 0; i < 30; i++) {
      const zine = await zineOf(owner, i % 3 === 0);
      ids[zine.published ? "public" : "private"].push(zine.id);
    }
    const all: { id: string; updatedAt: string }[] = [];
    let cursor: string | null = null;
    do {
      const body: { zines: { id: string; updatedAt: string }[]; nextCursor: string | null } = await (
        await list(`?owner=${owner.id}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)
      ).json();
      all.push(...body.zines);
      cursor = body.nextCursor;
    } while (cursor);
    expect(all).toHaveLength(30);
    expect(new Set(all.map((z) => z.id)).size).toBe(30);
    expect(all.map((z) => z.updatedAt)).toEqual([...all.map((z) => z.updatedAt)].sort().reverse());

    const only = async (status: string) => ((await (await list(`?owner=${owner.id}&status=${status}`)).json()).zines as { id: string }[]).map((z) => z.id).sort();
    expect(await only("public")).toEqual([...ids.public].sort());
    expect(await only("private")).toEqual([...ids.private].sort());
  });

  it("refuses a bad status, owner, or cursor", async () => {
    signIn(await make("admin"));
    for (const q of ["?status=draft", "?owner=../x", `?owner=${"a".repeat(65)}`, "?cursor=nope"]) expect((await list(q)).status, q).toBe(400);
  });

  it("is rate limited with the panel's other lists", async () => {
    signIn(await make("admin"));
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await list("?owner=nobody")).status;
    expect(last).toBe(429);
  });
});
