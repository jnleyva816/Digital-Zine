import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { GET as LIST, POST as CREATE } from "@/app/api/zines/route";
import { DELETE, GET, PATCH } from "@/app/api/zines/[id]/route";
import { createAsset, createTestUser, deleteTestUser, jsonRequest, params } from "./helpers";

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

let me: Awaited<ReturnType<typeof createTestUser>>;
let other: Awaited<ReturnType<typeof createTestUser>>;

beforeAll(async () => {
  me = await createTestUser();
  other = await createTestUser();
});

afterAll(async () => {
  await deleteTestUser(me.id);
  await deleteTestUser(other.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Several tests here need more than one zine, which Free no longer allows (DIG-32). The limit
  // tests at the end set the tier they test.
  mockedUser.mockResolvedValue({ ...me, tier: "pro" });
  await prisma.zine.deleteMany({ where: { ownerId: { in: [me.id, other.id] } } });
  await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: [me.id, other.id] } } });
});

type ZineBody = {
  zine: {
    id: string;
    slug: string;
    title: string;
    published: boolean;
    publishedAt: string | null;
    pages: { pageNumber: number; flipEnabled: boolean; content: { assetId: string; caption: string } }[];
  };
};

async function createZine(title = "Spring Issue", assetIds?: string[]) {
  const res = await CREATE(jsonRequest("/api/zines", "POST", { title, ...(assetIds ? { assetIds } : {}) }));
  expect(res.status).toBe(201);
  return ((await res.json()) as ZineBody).zine;
}

const patch = (id: string, body: unknown) => PATCH(jsonRequest(`/api/zines/${id}`, "PATCH", body), params({ id }));

describe("auth and ownership", () => {
  it("returns 401 on every zine route without a session", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await LIST()).status).toBe(401);
    expect((await CREATE(jsonRequest("/", "POST", { title: "x" }))).status).toBe(401);
    expect((await GET(jsonRequest("/", "GET"), params({ id: "x" }))).status).toBe(401);
    expect((await patch("x", {})).status).toBe(401);
    expect((await DELETE(jsonRequest("/", "DELETE"), params({ id: "x" }))).status).toBe(401);
  });

  it("returns 404 for another creator's zine on GET, PATCH, and DELETE", async () => {
    mockedUser.mockResolvedValue(other);
    const theirs = await createZine("Theirs", []);
    mockedUser.mockResolvedValue(me);
    expect((await GET(jsonRequest("/", "GET"), params({ id: theirs.id }))).status).toBe(404);
    expect((await patch(theirs.id, { title: "Mine now" })).status).toBe(404);
    expect((await DELETE(jsonRequest("/", "DELETE"), params({ id: theirs.id }))).status).toBe(404);
    expect(await prisma.zine.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });
});

describe("create and list", () => {
  it("rejects a missing title with 400", async () => {
    expect((await CREATE(jsonRequest("/", "POST", { title: "" }))).status).toBe(400);
  });

  it("creates a draft with pages for the given photos, in order, with flip on", async () => {
    const a = await createAsset(me.id, 0, "a.jpg");
    const b = await createAsset(me.id, 1, "b.jpg");
    const zine = await createZine("Spring Issue", [b.id, a.id]);
    expect(zine).toMatchObject({ title: "Spring Issue", slug: "spring-issue", published: false, publishedAt: null });
    expect(zine.pages.map((p) => [p.pageNumber, p.content.assetId, p.flipEnabled])).toEqual([
      [1, b.id, true],
      [2, a.id, true],
    ]);
  });

  it("makes the slug unique when the title collides", async () => {
    await createZine("Same Title", []);
    const second = await createZine("Same Title", []);
    expect(second.slug).toMatch(/^same-title-[0-9a-f]{4}$/);
  });

  it("lists only my zines, most recently updated first", async () => {
    const older = await createZine("Older", []);
    await createZine("Newer", []);
    await patch(older.id, { title: "Older, edited" });
    mockedUser.mockResolvedValue(other);
    await createZine("Not mine", []);
    mockedUser.mockResolvedValue(me);
    const { zines } = (await (await LIST()).json()) as { zines: { title: string }[] };
    expect(zines.map((z) => z.title)).toEqual(["Older, edited", "Newer"]);
  });
});

describe("PATCH pages", () => {
  it("replaces pages with captions, flip settings, and new order", async () => {
    const a = await createAsset(me.id, 0, "a.jpg");
    const b = await createAsset(me.id, 1, "b.jpg");
    const zine = await createZine("Issue", [a.id, b.id]);
    const res = await patch(zine.id, {
      pages: [
        { assetId: b.id, caption: "Cellar at dawn", flipEnabled: false },
        { assetId: a.id, caption: "" },
      ],
    });
    expect(res.status).toBe(200);
    const pages = await prisma.zinePage.findMany({ where: { zineId: zine.id }, orderBy: { pageNumber: "asc" } });
    expect(pages.map((p) => [p.pageNumber, p.content, p.flipEnabled])).toEqual([
      [1, { assetId: b.id, caption: "Cellar at dawn" }, false],
      [2, { assetId: a.id, caption: "" }, true],
    ]);
  });

  it("rejects photos from another creator's board with 400 and changes nothing", async () => {
    const mine = await createAsset(me.id, 0);
    const theirs = await createAsset(other.id, 0);
    const zine = await createZine("Issue", [mine.id]);
    const res = await patch(zine.id, { pages: [{ assetId: theirs.id }] });
    expect(res.status).toBe(400);
    expect(await prisma.zinePage.count({ where: { zineId: zine.id } })).toBe(1);
  });

  it("rejects a caption over 400 characters with 400", async () => {
    const mine = await createAsset(me.id, 0);
    const zine = await createZine("Issue", [mine.id]);
    expect((await patch(zine.id, { pages: [{ assetId: mine.id, caption: "x".repeat(401) }] })).status).toBe(400);
  });
});

describe("publishing", () => {
  it("refuses to publish a zine with no pages", async () => {
    const zine = await createZine("Empty", []);
    const res = await patch(zine.id, { published: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Add at least one page before publishing." });
    expect((await prisma.zine.findUnique({ where: { id: zine.id } }))?.published).toBe(false);
  });

  it("refuses to publish when the same request removes every page", async () => {
    const mine = await createAsset(me.id, 0);
    const zine = await createZine("Issue", [mine.id]);
    expect((await patch(zine.id, { pages: [], published: true })).status).toBe(400);
  });

  it("publishes, records the first publish time, and keeps it through unpublish and republish", async () => {
    const mine = await createAsset(me.id, 0);
    const zine = await createZine("Issue", [mine.id]);

    const published = ((await (await patch(zine.id, { published: true })).json()) as ZineBody).zine;
    expect(published.published).toBe(true);
    expect(published.publishedAt).not.toBeNull();

    const unpublished = ((await (await patch(zine.id, { published: false })).json()) as ZineBody).zine;
    expect(unpublished.published).toBe(false);
    expect(unpublished.publishedAt).toBe(published.publishedAt);

    const republished = ((await (await patch(zine.id, { published: true })).json()) as ZineBody).zine;
    expect(republished.publishedAt).toBe(published.publishedAt);
  });
});

describe("slug", () => {
  it("can be changed while the zine has never been published", async () => {
    const zine = await createZine("Draft", []);
    const res = await patch(zine.id, { slug: "My Custom URL" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as ZineBody).zine.slug).toBe("my-custom-url");
  });

  it("rejects a slug another zine already uses with 409", async () => {
    await createZine("Taken", []);
    const zine = await createZine("Draft", []);
    expect((await patch(zine.id, { slug: "taken" })).status).toBe(409);
  });

  it("is locked once the zine has been published, even after unpublishing", async () => {
    const mine = await createAsset(me.id, 0);
    const zine = await createZine("Issue", [mine.id]);
    await patch(zine.id, { published: true });

    let res = await patch(zine.id, { slug: "new-url" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "The public URL is locked once a zine has been published." });

    await patch(zine.id, { published: false });
    res = await patch(zine.id, { slug: "new-url" });
    expect(res.status).toBe(409);
    expect((await prisma.zine.findUnique({ where: { id: zine.id } }))?.slug).toBe("issue");
  });

  it("accepts the unchanged slug on a published zine, so a full save still works", async () => {
    const mine = await createAsset(me.id, 0);
    const zine = await createZine("Issue", [mine.id]);
    await patch(zine.id, { published: true });
    expect((await patch(zine.id, { slug: "issue", title: "Issue, revised" })).status).toBe(200);
  });
});

describe("DELETE", () => {
  it("deletes my zine and its pages", async () => {
    const mine = await createAsset(me.id, 0);
    const zine = await createZine("Issue", [mine.id]);
    expect((await DELETE(jsonRequest("/", "DELETE"), params({ id: zine.id }))).status).toBe(200);
    expect(await prisma.zine.findUnique({ where: { id: zine.id } })).toBeNull();
    expect(await prisma.zinePage.count({ where: { zineId: zine.id } })).toBe(0);
  });
});

describe("POST /api/zines zine limit (DIG-32)", () => {
  const create = (title: string) => CREATE(jsonRequest("/api/zines", "POST", { title }));

  it("lets a Free creator make one zine, then refuses a second with 403", async () => {
    mockedUser.mockResolvedValue({ ...me, tier: "free" });
    expect((await create("First")).status).toBe(201);
    const res = await create("Second");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Free includes 1 zine. Upgrade to Pro for unlimited zines.",
      code: "zine_limit",
    });
    expect(await prisma.zine.count({ where: { ownerId: me.id } })).toBe(1);
  });

  it("lets a Pro creator make as many zines as they like", async () => {
    mockedUser.mockResolvedValue({ ...me, tier: "pro" });
    for (const title of ["One", "Two", "Three"]) {
      expect((await create(title)).status).toBe(201);
    }
  });

  it("holds an admin viewing as Free to the Free limit", async () => {
    mockedUser.mockResolvedValue({ ...me, tier: "free", role: "admin", viewingAsFree: true });
    expect((await create("First")).status).toBe(201);
    expect((await create("Second")).status).toBe(403);
  });
});
