import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { GET } from "@/app/api/assets/route";
import { createAsset, createBoard, createTestUser, deleteTestUser } from "./helpers";

// DIG-88: the tray searches and filters a whole board on the server.
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);
let me: Awaited<ReturnType<typeof createTestUser>>;
let other: typeof me;
let board: { id: string };

beforeAll(async () => {
  me = await createTestUser();
  other = await createTestUser();
  board = await createBoard(me.id, "Roll", 0);
  const make = async (n: number, name: string, data: object = {}) => {
    const a = await createAsset(me.id, n, name, board.id);
    return prisma.mediaAsset.update({ where: { id: a.id }, data });
  };
  const harbor = await make(0, "dscf1.jpg", { name: "Harbor 100% at dusk" });
  await make(1, "dscf2.jpg", { kind: "recipe", recipe: { name: "Kodachrome 64", filmSimulation: "Classic Chrome" } });
  await make(2, "ridge.jpg", { exif: { cameraModel: "X100VI" } });
  await prisma.boardPlacement.create({ data: { assetId: harbor.id, boardId: board.id, x: 0, y: 0, width: 200 } });
  await createAsset(other.id, 0, "harbor.jpg");
});
afterAll(async () => {
  await deleteTestUser(me.id);
  await deleteTestUser(other.id);
  await prisma.$disconnect();
});
beforeEach(() => void mockedUser.mockResolvedValue(me));

const ask = async (query: string) => {
  const res = await GET(new Request(`http://test.local/api/assets?boardId=${board.id}&limit=60&${query}`));
  return { status: res.status, body: (await res.json()) as { assets: { originalName: string }[]; total: number; nextCursor: string | null; counts: Record<string, number> } };
};
const names = async (query: string) => (await ask(query)).body.assets.map((a) => a.originalName);

describe("GET /api/assets for the tray", () => {
  it.each([
    ["a name", "harbor", ["dscf1.jpg"]],
    ["a file name", "ridge", ["ridge.jpg"]],
    ["a recipe", "KODA", ["dscf2.jpg"]],
    ["a film simulation", "classic chrome", ["dscf2.jpg"]],
    ["a camera", "x100", ["ridge.jpg"]],
    ["nothing that exists", "zzz", []],
  ])("finds photos by %s, whatever the case", async (_label, q, found) => {
    expect(await names(`q=${encodeURIComponent(q)}`)).toEqual(found);
  });

  it("treats % and _ as plain characters", async () => {
    expect(await names(`q=${encodeURIComponent("100%")}`)).toEqual(["dscf1.jpg"]);
    expect(await names("q=_")).toEqual([]);
  });

  it("filters to photos not on the board, and to recipes", async () => {
    expect(await names("show=unplaced")).toEqual(["dscf2.jpg", "ridge.jpg"]);
    expect(await names("show=recipes")).toEqual(["dscf2.jpg"]);
    expect(await names("show=unplaced&q=ridge")).toEqual(["ridge.jpg"]);
  });

  it("counts each filter, so the chips can show them", async () => {
    expect((await ask("")).body.counts).toEqual({ all: 3, unplaced: 2, recipes: 1 });
  });

  it("refuses an unknown filter and an overlong search, and needs a session", async () => {
    expect((await ask("show=everything")).status).toBe(400);
    expect((await ask(`q=${"x".repeat(101)}`)).status).toBe(400);
    mockedUser.mockResolvedValue(null);
    expect((await ask("q=harbor")).status).toBe(401);
  });

  it("shows another creator nothing", async () => {
    mockedUser.mockResolvedValue(other);
    const { body } = await ask("q=harbor");
    expect(body.assets).toEqual([]);
    expect(body.counts).toEqual({ all: 0, unplaced: 0, recipes: 0 });
  });
});
