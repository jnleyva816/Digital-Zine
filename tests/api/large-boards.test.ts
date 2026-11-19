import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { GET } from "@/app/api/assets/route";
import { POST as REORDER } from "@/app/api/assets/reorder/route";
import { BOARD_PAGE_SIZE } from "@/lib/board-pages";
import { createBoard, createTestUser, defaultBoardId, deleteTestUser, jsonRequest, resetRateLimits } from "./helpers";

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

let me: Awaited<ReturnType<typeof createTestUser>>;
let other: Awaited<ReturnType<typeof createTestUser>>;
let board: string;

beforeAll(async () => {
  me = await createTestUser();
  other = await createTestUser();
  board = await defaultBoardId(me.id);
});

afterAll(async () => {
  await deleteTestUser(me.id);
  await deleteTestUser(other.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetRateLimits();
  mockedUser.mockResolvedValue(me);
  await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: [me.id, other.id] } } });
});

/** `count` photos on `boardId`, named p000, p001, … in board order. */
async function photos(count: number, boardId = board, ownerId = me.id) {
  await prisma.mediaAsset.createMany({
    data: Array.from({ length: count }, (_, i) => {
      const name = `p${String(i).padStart(3, "0")}`;
      const key = `users/${ownerId}/${boardId}-${name}.jpg`;
      return { ownerId, boardId, storageKey: key, publicUrl: `/api/media/${key}`, originalName: name, sortOrder: i };
    }),
  });
  return prisma.mediaAsset.findMany({ where: { boardId }, orderBy: { sortOrder: "asc" }, select: { id: true, originalName: true } });
}

type Page = { assets: { id: string; originalName: string }[]; nextCursor: string | null; total: number };
const page = async (query: string) => (await (await GET(jsonRequest(`/api/assets?${query}`, "GET"))).json()) as Page;
const order = async () =>
  (await prisma.mediaAsset.findMany({ where: { boardId: board }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })).map(
    (a) => a.originalName
  );

describe("board photos one page at a time (DIG-29)", () => {
  it("pages through a board in order with a cursor, and gives the total", async () => {
    await photos(130);
    expect(BOARD_PAGE_SIZE).toBe(60);
    const first = await page(`boardId=${board}&limit=60`);
    expect(first.total).toBe(130);
    expect(first.assets).toHaveLength(60);
    expect(first.assets[0].originalName).toBe("p000");
    expect(first.nextCursor).not.toBeNull();

    const second = await page(`boardId=${board}&limit=60&cursor=${first.nextCursor}`);
    expect(second.assets.map((a) => a.originalName).slice(0, 2)).toEqual(["p060", "p061"]);
    const third = await page(`boardId=${board}&limit=60&cursor=${second.nextCursor}`);
    expect(third.assets).toHaveLength(10);
    expect(third.assets.at(-1)?.originalName).toBe("p129");
    expect(third.nextCursor).toBeNull();
  });

  it("caps a page at 200 and rejects a bad limit or a cursor from someone else's photo", async () => {
    await photos(3);
    expect((await GET(jsonRequest(`/api/assets?boardId=${board}&limit=0`, "GET"))).status).toBe(400);
    expect((await GET(jsonRequest(`/api/assets?boardId=${board}&limit=500`, "GET"))).status).toBe(400);
    const [theirs] = await photos(1, await defaultBoardId(other.id), other.id);
    expect((await GET(jsonRequest(`/api/assets?boardId=${board}&limit=10&cursor=${theirs.id}`, "GET"))).status).toBe(400);
  });

  it("returns only the photos asked for by id, for checking on ones still processing", async () => {
    const all = await photos(5);
    const res = await page(`ids=${all[1].id},${all[3].id}`);
    expect(res.assets.map((a) => a.originalName).sort()).toEqual(["p001", "p003"]);
  });

  it("never returns another creator's photos, even by id", async () => {
    const [theirs] = await photos(1, await defaultBoardId(other.id), other.id);
    expect((await page(`ids=${theirs.id}`)).assets).toEqual([]);
  });
});

describe("reordering a board that is only partly loaded (DIG-29)", () => {
  it("puts the sent photos first, in the sent order, and keeps the rest of the board in its order after them", async () => {
    const all = await photos(6);
    // The first three are loaded; the creator moves the third to the front.
    const res = await REORDER(jsonRequest("/", "POST", { orderedIds: [all[2].id, all[0].id, all[1].id] }));
    expect(res.status).toBe(200);
    expect(await order()).toEqual(["p002", "p000", "p001", "p003", "p004", "p005"]);
  });

  it("keeps unsent photos after the sent ones even when sort orders are tied, as older boards have", async () => {
    const all = await photos(6);
    await prisma.mediaAsset.updateMany({ where: { boardId: board }, data: { sortOrder: 0 } });
    await REORDER(jsonRequest("/", "POST", { orderedIds: [all[2].id, all[0].id, all[1].id] }));
    const result = await order();
    expect(result.slice(0, 3)).toEqual(["p002", "p000", "p001"]);
    expect(result.slice(3).sort()).toEqual(["p003", "p004", "p005"]);
    // Every photo ends up with its own position.
    const positions = (await prisma.mediaAsset.findMany({ where: { boardId: board } })).map((a) => a.sortOrder);
    expect(new Set(positions).size).toBe(6);
  });

  it("only reorders the board the photos are on", async () => {
    const all = await photos(3);
    const trip = await createBoard(me.id, "Trip");
    const elsewhere = await photos(2, trip.id);
    await REORDER(jsonRequest("/", "POST", { orderedIds: [all[1].id, all[0].id] }));
    expect(await order()).toEqual(["p001", "p000", "p002"]);
    const tripOrder = await prisma.mediaAsset.findMany({ where: { boardId: trip.id }, orderBy: { sortOrder: "asc" } });
    expect(tripOrder.map((a) => a.id)).toEqual(elsewhere.map((a) => a.id));
  });

  it("rejects photos from more than one board with 400", async () => {
    const [a] = await photos(1);
    const trip = await createBoard(me.id, "Trip");
    const [b] = await photos(1, trip.id);
    expect((await REORDER(jsonRequest("/", "POST", { orderedIds: [a.id, b.id] }))).status).toBe(400);
  });

  it("reorders a 1,000-photo board in one go", async () => {
    const all = await photos(1000);
    const started = Date.now();
    const res = await REORDER(jsonRequest("/", "POST", { orderedIds: [all[999].id, ...all.slice(0, 59).map((a) => a.id)] }));
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(3000);
    const result = await order();
    expect(result.slice(0, 3)).toEqual(["p999", "p000", "p001"]);
    expect(result.at(-1)).toBe("p998");
  });
});
