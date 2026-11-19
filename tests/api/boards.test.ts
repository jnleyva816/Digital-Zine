import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { GET as LIST, POST as CREATE } from "@/app/api/boards/route";
import { DELETE, PATCH } from "@/app/api/boards/[id]/route";
import { POST as REORDER } from "@/app/api/boards/reorder/route";
import { createAsset, createBoard, createTestUser, createZineUsing, deleteTestUser, jsonRequest, params } from "./helpers";

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

type User = Awaited<ReturnType<typeof createTestUser>>;
let me: User;
let other: User;

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
  // Most tests need several boards, which only Pro allows. The limit tests set Free.
  mockedUser.mockResolvedValue({ ...me, tier: "pro" });
  const ids = [me.id, other.id];
  await prisma.zine.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.board.deleteMany({ where: { ownerId: { in: ids } } });
});

type BoardRow = { id: string; name: string; sortOrder: number; photoCount: number; zineCount: number };

const list = async () => (await (await LIST()).json()) as { boards: BoardRow[] };
const create = (body: unknown) => CREATE(jsonRequest("/api/boards", "POST", body));
const rename = (id: string, body: unknown) => PATCH(jsonRequest(`/api/boards/${id}`, "PATCH", body), params({ id }));
const remove = (id: string, body?: unknown) => DELETE(jsonRequest(`/api/boards/${id}`, "DELETE", body), params({ id }));
const reorder = (body: unknown) => REORDER(jsonRequest("/api/boards/reorder", "POST", body));

describe("auth and ownership", () => {
  it("returns 401 on every board route without a session", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await LIST()).status).toBe(401);
    expect((await create({ name: "Trips" })).status).toBe(401);
    expect((await rename("x", { name: "Trips" })).status).toBe(401);
    expect((await remove("x")).status).toBe(401);
    expect((await reorder({ orderedIds: ["x"] })).status).toBe(401);
  });

  it("returns 404 for another creator's board on rename and delete, and changes nothing", async () => {
    const theirs = await createBoard(other.id, "Theirs", 0);
    expect((await rename(theirs.id, { name: "Mine now" })).status).toBe(404);
    expect((await remove(theirs.id)).status).toBe(404);
    expect(await prisma.board.findUnique({ where: { id: theirs.id } })).toMatchObject({ name: "Theirs" });
  });
});

describe("GET /api/boards", () => {
  it("gives a creator with no boards “My board”", async () => {
    const { boards } = await list();
    expect(boards).toEqual([expect.objectContaining({ name: "My board", photoCount: 0, zineCount: 0 })]);
  });

  it("lists only my boards, in order, with how many photos and zines each has", async () => {
    const second = await createBoard(me.id, "Second", 1);
    const first = await createBoard(me.id, "First", 0);
    await createBoard(other.id, "Theirs", 0);
    const photo = await createAsset(me.id, 0, "a.jpg", second.id);
    await createAsset(me.id, 1, "b.jpg", second.id);
    await createZineUsing(me.id, photo.id, "Zine", second.id);

    const { boards } = await list();
    expect(boards.map((b) => [b.name, b.photoCount, b.zineCount])).toEqual([
      ["First", 0, 0],
      ["Second", 2, 1],
    ]);
    expect(boards[0].id).toBe(first.id);
  });
});

describe("POST /api/boards", () => {
  it("creates a board at the end of my list, with the name trimmed", async () => {
    await createBoard(me.id, "First", 0);
    const res = await create({ name: "  Tokyo 2026  " });
    expect(res.status).toBe(201);
    const { board } = (await res.json()) as { board: BoardRow };
    expect(board).toMatchObject({ name: "Tokyo 2026", sortOrder: 1 });
    expect(await prisma.board.findUnique({ where: { id: board.id } })).toMatchObject({ ownerId: me.id });
  });

  it("rejects a blank or over-long name with 400", async () => {
    expect((await create({ name: "   " })).status).toBe(400);
    expect((await create({ name: "x".repeat(81) })).status).toBe(400);
    expect((await create({})).status).toBe(400);
  });

  it("lets a Free creator keep one board, and refuses a second with 403", async () => {
    mockedUser.mockResolvedValue({ ...me, tier: "free" });
    await createBoard(me.id, "My board", 0);
    const res = await create({ name: "Second" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Free includes 1 board. Upgrade to Pro for unlimited boards.",
      code: "board_limit",
    });
    expect(await prisma.board.count({ where: { ownerId: me.id } })).toBe(1);
  });

  it("lets a Pro creator add as many boards as they like", async () => {
    for (const name of ["A", "B", "C"]) expect((await create({ name })).status).toBe(201);
    expect(await prisma.board.count({ where: { ownerId: me.id } })).toBe(3);
  });
});

describe("PATCH /api/boards/[id]", () => {
  it("renames my board", async () => {
    const board = await createBoard(me.id, "Old", 0);
    const res = await rename(board.id, { name: " New name " });
    expect(res.status).toBe(200);
    expect(await prisma.board.findUnique({ where: { id: board.id } })).toMatchObject({ name: "New name" });
  });

  it("rejects a blank name with 400", async () => {
    const board = await createBoard(me.id, "Old", 0);
    expect((await rename(board.id, { name: "" })).status).toBe(400);
  });
});

describe("DELETE /api/boards/[id]", () => {
  it("is refused with 409 while a zine is built from the board, and names the zine", async () => {
    const board = await createBoard(me.id, "Trip", 0);
    await createBoard(me.id, "Other", 1);
    const photo = await createAsset(me.id, 0, "a.jpg", board.id);
    await createZineUsing(me.id, photo.id, "Harbor Notes", board.id);

    const res = await remove(board.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: "“Harbor Notes” is built from this board. Delete that zine or move it to another board first.",
    });
    expect(await prisma.board.count({ where: { id: board.id } })).toBe(1);
  });

  it("refuses to delete my only board with 409", async () => {
    const only = await createBoard(me.id, "Only", 0);
    const res = await remove(only.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "You need at least one board." });
  });

  it("deletes an empty board without asking where photos go", async () => {
    const empty = await createBoard(me.id, "Empty", 0);
    await createBoard(me.id, "Keep", 1);
    expect((await remove(empty.id)).status).toBe(200);
    expect(await prisma.board.count({ where: { id: empty.id } })).toBe(0);
  });

  it("needs a board to move the photos to when the board has any (400)", async () => {
    const full = await createBoard(me.id, "Full", 0);
    await createBoard(me.id, "Keep", 1);
    await createAsset(me.id, 0, "a.jpg", full.id);
    const res = await remove(full.id);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Choose a board to move this board's photos to." });
  });

  it("refuses to move photos to another creator's board, or to the board being deleted", async () => {
    const full = await createBoard(me.id, "Full", 0);
    await createBoard(me.id, "Keep", 1);
    await createAsset(me.id, 0, "a.jpg", full.id);
    const theirs = await createBoard(other.id, "Theirs", 0);
    expect((await remove(full.id, { moveToBoardId: theirs.id })).status).toBe(404);
    expect((await remove(full.id, { moveToBoardId: full.id })).status).toBe(400);
    expect(await prisma.mediaAsset.count({ where: { boardId: full.id } })).toBe(1);
  });

  it("moves the photos after the target board's own photos, in their order, then deletes the board", async () => {
    const gone = await createBoard(me.id, "Gone", 0);
    const keep = await createBoard(me.id, "Keep", 1);
    const kept = await createAsset(me.id, 0, "kept.jpg", keep.id);
    const second = await createAsset(me.id, 1, "second.jpg", gone.id);
    const first = await createAsset(me.id, 0, "first.jpg", gone.id);

    const res = await remove(gone.id, { moveToBoardId: keep.id });
    expect(res.status).toBe(200);
    expect(await prisma.board.count({ where: { id: gone.id } })).toBe(0);
    const onKeep = await prisma.mediaAsset.findMany({ where: { boardId: keep.id }, orderBy: { sortOrder: "asc" } });
    expect(onKeep.map((a) => a.id)).toEqual([kept.id, first.id, second.id]);
  });
});

describe("POST /api/boards/reorder", () => {
  it("saves the new order and ignores ids that are not my boards", async () => {
    const a = await createBoard(me.id, "A", 0);
    const b = await createBoard(me.id, "B", 1);
    const theirs = await createBoard(other.id, "Theirs", 0);
    const res = await reorder({ orderedIds: [b.id, theirs.id, a.id] });
    expect(res.status).toBe(200);
    expect((await list()).boards.map((x) => x.name)).toEqual(["B", "A"]);
    expect(await prisma.board.findUnique({ where: { id: theirs.id } })).toMatchObject({ sortOrder: 0 });
  });

  it("rejects a malformed body with 400", async () => {
    expect((await reorder({ orderedIds: [] })).status).toBe(400);
    expect((await reorder("nope")).status).toBe(400);
  });
});
