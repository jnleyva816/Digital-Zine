import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { DELETE as DELETE_BOARD, PATCH as PATCH_BOARD } from "@/app/api/boards/[id]/route";
import { GET, PUT } from "@/app/api/boards/[id]/layout/route";
import { POST as ADD_NOTE } from "@/app/api/boards/[id]/notes/route";
import { DELETE as DELETE_NOTE, PATCH as PATCH_NOTE } from "@/app/api/boards/[id]/notes/[noteId]/route";
import { DELETE as DELETE_ASSET, PATCH as PATCH_ASSET } from "@/app/api/assets/[id]/route";
import { MAX_BOARD_NOTES } from "@/lib/board-layout";
import { createAsset, createBoard, createTestUser, deleteTestUser, jsonRequest, params, resetRateLimits } from "./helpers";

// DIG-85: each board remembers its free-form layout and notes.
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

type User = Awaited<ReturnType<typeof createTestUser>>;
let me: User;
let other: User;
let board: { id: string };
let photo: { id: string };

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
  await resetRateLimits();
  mockedUser.mockResolvedValue({ ...me, tier: "pro" });
  const ids = [me.id, other.id];
  await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.board.deleteMany({ where: { ownerId: { in: ids } } });
  board = await createBoard(me.id, "Roll", 0);
  photo = await createAsset(me.id, 0, "a.jpg", board.id);
});

const spot = (assetId: string, over: Record<string, unknown> = {}) => ({ assetId, x: 40, y: -12.5, width: 220, rotation: -3, z: 2, look: "print", tape: true, ...over });
const read = async (id = board.id) => GET(new Request("http://test.local"), params({ id }));
const layout = async (id = board.id) => (await (await read(id)).json()) as { placements: Record<string, unknown>[]; notes: { id: string; text: string; x: number }[] };
const put = (body: unknown, id = board.id) => PUT(jsonRequest(`/api/boards/${id}/layout`, "PUT", body), params({ id }));
const addNote = (body: unknown, id = board.id) => ADD_NOTE(jsonRequest(`/api/boards/${id}/notes`, "POST", body), params({ id }));
const note = { text: "warm palette for the cover?", x: 10, y: 20, width: 180, rotation: 2, z: 5 };
const patchNote = (noteId: string, body: unknown, id = board.id) => PATCH_NOTE(jsonRequest("/", "PATCH", body), params({ id, noteId }));
const removeNote = (noteId: string, id = board.id) => DELETE_NOTE(jsonRequest("/", "DELETE"), params({ id, noteId }));
const makeNote = async () => ((await (await addNote(note)).json()) as { note: { id: string } }).note.id;

describe("who may", () => {
  it("needs a session on every route", async () => {
    mockedUser.mockResolvedValue(null);
    for (const res of [await read(), await put({ placements: [] }), await addNote(note), await patchNote("x", {}), await removeNote("x")]) expect(res.status).toBe(401);
  });

  it("hides another creator's board, and changes nothing on it", async () => {
    const theirs = await createBoard(other.id, "Theirs", 0);
    const theirPhoto = await createAsset(other.id, 0, "b.jpg", theirs.id);
    const theirNote = await prisma.boardNote.create({ data: { boardId: theirs.id, ...note } });
    for (const res of [
      await read(theirs.id),
      await put({ placements: [spot(theirPhoto.id)] }, theirs.id),
      await addNote(note, theirs.id),
      await patchNote(theirNote.id, { text: "mine" }, theirs.id),
      await removeNote(theirNote.id, theirs.id),
      // Their note, reached through my own board.
      await patchNote(theirNote.id, { text: "mine" }),
      await removeNote(theirNote.id),
    ]) expect(res.status).toBe(404);
    expect(await prisma.boardPlacement.count({ where: { boardId: theirs.id } })).toBe(0);
    expect(await prisma.boardNote.findUniqueOrThrow({ where: { id: theirNote.id } })).toMatchObject({ text: note.text });
  });

  it("refuses someone else's photo, or one on another board, and saves none of the batch", async () => {
    const elsewhere = await createBoard(me.id, "Other roll", 1);
    const stray = await createAsset(me.id, 0, "c.jpg", elsewhere.id);
    const theirs = await createAsset(other.id, 0, "d.jpg");
    for (const bad of [stray.id, theirs.id, "no-such-photo"]) {
      expect((await put({ placements: [spot(photo.id), spot(bad)] })).status, bad).toBe(404);
      expect((await layout()).placements).toEqual([]);
    }
  });
});

describe("placements", () => {
  it("saves a batch, reads it back, and updates it in place", async () => {
    const second = await createAsset(me.id, 1, "b.jpg", board.id);
    expect((await put({ placements: [spot(photo.id), spot(second.id, { z: 3 })] })).status).toBe(200);
    expect((await put({ placements: [spot(photo.id, { x: 99, look: "plain", tape: false })] })).status).toBe(200);
    const { placements } = await layout();
    // In stacking order.
    expect(placements).toEqual([spot(photo.id, { x: 99, look: "plain", tape: false }), spot(second.id, { z: 3 })]);
  });

  it("takes photos off the board without deleting them", async () => {
    await put({ placements: [spot(photo.id)] });
    expect((await put({ removed: [photo.id] })).status).toBe(200);
    expect((await layout()).placements).toEqual([]);
    expect(await prisma.mediaAsset.count({ where: { id: photo.id } })).toBe(1);
  });

  it("never changes board order", async () => {
    const before = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: photo.id } });
    await put({ placements: [spot(photo.id, { z: 900 })] });
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: photo.id } })).sortOrder).toBe(before.sortOrder);
  });

  it.each([
    ["too steep a tilt", { rotation: 16 }],
    ["too small", { width: 5 }],
    ["too large", { width: 5000 }],
    ["off the edge of the world", { x: 1e9 }],
    ["not a number", { y: "left" }],
    ["a fractional stacking order", { z: 1.5 }],
    ["an unknown look", { look: "neon" }],
    ["an extra key", { boardId: "x" }],
  ])("refuses %s with 400", async (_label, over) => {
    expect((await put({ placements: [spot(photo.id, over)] })).status).toBe(400);
    expect((await layout()).placements).toEqual([]);
  });

  it("refuses an empty change, the same photo twice, and a body that is not JSON", async () => {
    expect((await put({})).status).toBe(400);
    expect((await put({ placements: [spot(photo.id), spot(photo.id)] })).status).toBe(400);
    expect((await put("{")).status).toBe(400);
  });

  it("stops at the write limit", async () => {
    await prisma.rateLimit.create({ data: { key: `write:${me.id}`, count: 120, windowStart: new Date() } });
    expect((await put({ placements: [spot(photo.id)] })).status).toBe(429);
  });
});

describe("what happens to a placement", () => {
  beforeEach(async () => {
    await put({ placements: [spot(photo.id)] });
  });

  it("goes when the photo is deleted", async () => {
    expect((await DELETE_ASSET(jsonRequest("/", "DELETE"), params({ id: photo.id }))).status).toBe(200);
    expect(await prisma.boardPlacement.count({ where: { assetId: photo.id } })).toBe(0);
  });

  it("goes when the photo moves to another board", async () => {
    const next = await createBoard(me.id, "Next", 1);
    expect((await PATCH_ASSET(jsonRequest("/", "PATCH", { boardId: next.id }), params({ id: photo.id }))).status).toBe(200);
    expect((await layout()).placements).toEqual([]);
    expect((await layout(next.id)).placements).toEqual([]);
  });

  it("stays when the photo changes but does not move", async () => {
    await PATCH_ASSET(jsonRequest("/", "PATCH", { name: "Harbor", boardId: board.id }), params({ id: photo.id }));
    expect((await layout()).placements).toHaveLength(1);
  });

  it("goes with the board, and so do its notes", async () => {
    const next = await createBoard(me.id, "Next", 1);
    await addNote(note);
    expect((await DELETE_BOARD(jsonRequest("/", "DELETE", { moveToBoardId: next.id }), params({ id: board.id }))).status).toBe(200);
    expect(await prisma.boardPlacement.count({ where: { assetId: photo.id } })).toBe(0);
    expect(await prisma.boardNote.count({ where: { boardId: board.id } })).toBe(0);
    expect(await prisma.mediaAsset.count({ where: { id: photo.id, boardId: next.id } })).toBe(1);
  });
});

describe("notes", () => {
  it("are added, read with the layout, edited, moved in a batch, and deleted", async () => {
    const res = await addNote(note);
    expect(res.status).toBe(201);
    const { note: made } = (await res.json()) as { note: { id: string } };
    expect((await layout()).notes).toEqual([{ id: made.id, ...note }]);

    expect((await patchNote(made.id, { text: "  night set: 3 → 7 " })).status).toBe(200);
    expect((await put({ notes: [{ id: made.id, x: 500, y: 1, width: 200, rotation: 0, z: 9 }] })).status).toBe(200);
    expect((await layout()).notes).toEqual([{ id: made.id, text: "night set: 3 → 7", x: 500, y: 1, width: 200, rotation: 0, z: 9 }]);

    expect((await removeNote(made.id)).status).toBe(200);
    expect((await layout()).notes).toEqual([]);
  });

  it.each([
    ["no text", { text: "   " }],
    ["281 characters", { text: "x".repeat(281) }],
    ["a bad tilt", { rotation: -20 }],
  ])("refuse %s", async (_label, over) => {
    expect((await addNote({ ...note, ...over })).status).toBe(400);
    const id = await makeNote();
    expect((await patchNote(id, over)).status).toBe(400);
  });

  it("cannot be moved through another board", async () => {
    const id = await makeNote();
    const next = await createBoard(me.id, "Next", 1);
    expect((await put({ notes: [{ id, x: 1, y: 1, width: 200, rotation: 0, z: 1 }] }, next.id)).status).toBe(404);
  });

  it(`stop at ${MAX_BOARD_NOTES} on a board`, async () => {
    await prisma.boardNote.createMany({ data: Array.from({ length: MAX_BOARD_NOTES }, () => ({ boardId: board.id, ...note })) });
    expect((await addNote(note)).status).toBe(409);
  });
});

describe("the board's remembered view", () => {
  const prefs = (body: unknown) => PATCH_BOARD(jsonRequest("/", "PATCH", body), params({ id: board.id }));
  const stored = async () => (await prisma.board.findUniqueOrThrow({ where: { id: board.id } })) as { name: string; viewPrefs: unknown };

  it("is kept separately for wide and narrow screens, with the grid layout", async () => {
    expect((await prefs({ viewPrefs: { wide: "strip" } })).status).toBe(200);
    expect((await prefs({ viewPrefs: { narrow: "grid", gridLayout: "feature" } })).status).toBe(200);
    expect(await stored()).toMatchObject({ name: "Roll", viewPrefs: { wide: "strip", narrow: "grid", gridLayout: "feature" } });
  });

  it("refuses free form on a narrow screen, unknown views, and an empty change", async () => {
    for (const bad of [{ viewPrefs: { narrow: "free" } }, { viewPrefs: { wide: "pile" } }, {}]) expect((await prefs(bad)).status).toBe(400);
    expect((await stored()).viewPrefs).toBeNull();
  });
});

describe("size", () => {
  it("loads 300 placements on a 1,000-photo board in under 200 ms", async () => {
    await prisma.mediaAsset.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({ id: `lay-${me.id}-${i}`, ownerId: me.id, boardId: board.id, storageKey: `lay-${me.id}-${i}`, publicUrl: "/x", sortOrder: i })),
    });
    expect((await put({ placements: Array.from({ length: 300 }, (_, i) => spot(`lay-${me.id}-${i}`, { z: i })) })).status).toBe(200);
    await read();
    const start = performance.now();
    const { placements } = await layout();
    expect(placements).toHaveLength(300);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
