import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { GET as LIST, POST as CREATE } from "@/app/api/recipes/route";
import { DELETE, PATCH } from "@/app/api/recipes/[id]/route";
import { PATCH as PATCH_ASSET } from "@/app/api/assets/[id]/route";
import { createAsset, createSavedRecipe, createTestUser, deleteTestUser, jsonRequest, params } from "./helpers";

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
  mockedUser.mockResolvedValue(me);
  const ids = [me.id, other.id];
  await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.recipe.deleteMany({ where: { ownerId: { in: ids } } });
});

const kodachrome = { name: "Kodachrome 64", filmSimulation: "Classic Chrome", grain: "Weak, Small", shadow: -1 };
type Row = { id: string; recipe: { name: string; filmSimulation: string }; photoCount: number };

const list = async () => ((await (await LIST()).json()) as { recipes: Row[] }).recipes;
const create = (body: unknown) => CREATE(jsonRequest("/api/recipes", "POST", body));
const update = (id: string, body: unknown) => PATCH(jsonRequest(`/api/recipes/${id}`, "PATCH", body), params({ id }));
const remove = (id: string) => DELETE(jsonRequest(`/api/recipes/${id}`, "DELETE"), params({ id }));
const link = (assetId: string, recipeId: string | null) =>
  PATCH_ASSET(jsonRequest("/", "PATCH", { recipeId }), params({ id: assetId }));
const photo = (id: string) => prisma.mediaAsset.findUniqueOrThrow({ where: { id } });

describe("auth and ownership (DIG-24)", () => {
  it("returns 401 on every recipe route without a session", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await LIST()).status).toBe(401);
    expect((await create({ recipe: kodachrome })).status).toBe(401);
    expect((await update("x", { recipe: kodachrome })).status).toBe(401);
    expect((await remove("x")).status).toBe(401);
  });

  it("returns 404 for another creator's recipe, and never lists it", async () => {
    const theirs = await createSavedRecipe(other.id);
    expect((await update(theirs.id, { recipe: kodachrome })).status).toBe(404);
    expect((await remove(theirs.id)).status).toBe(404);
    expect(await list()).toEqual([]);
  });

  it("refuses to link my photo to another creator's recipe (404)", async () => {
    const theirs = await createSavedRecipe(other.id);
    const mine = await createAsset(me.id, 0);
    expect((await link(mine.id, theirs.id)).status).toBe(404);
    expect((await photo(mine.id)).recipeId).toBeNull();
  });
});

describe("the library", () => {
  it("saves a recipe and lists it by name with how many photos use it", async () => {
    const res = await create({ recipe: kodachrome });
    expect(res.status).toBe(201);
    await create({ recipe: { name: "Agfa Vista", filmSimulation: "Classic Neg." } });
    expect((await list()).map((r) => [r.recipe.name, r.photoCount])).toEqual([
      ["Agfa Vista", 0],
      ["Kodachrome 64", 0],
    ]);
  });

  it("rejects an invalid recipe with 400 and a name I already use with 409, ignoring case", async () => {
    expect((await create({ recipe: { name: "", filmSimulation: "Classic Chrome" } })).status).toBe(400);
    expect((await create({ recipe: { name: "Bad", filmSimulation: "Kodak Gold" } })).status).toBe(400);
    await create({ recipe: kodachrome });
    const dup = await create({ recipe: { ...kodachrome, name: " kodachrome 64 " } });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ error: "You already have a recipe named “kodachrome 64”." });
  });

  it("lets another creator use the same name", async () => {
    await createSavedRecipe(other.id, "Kodachrome 64");
    expect((await create({ recipe: kodachrome })).status).toBe(201);
  });
});

describe("linking photos", () => {
  it("links a photo to a saved recipe, copying its settings onto the photo", async () => {
    const saved = await createSavedRecipe(me.id, "Kodachrome 64", { filmSimulation: "Classic Chrome", shadow: -1 });
    const mine = await createAsset(me.id, 0);
    expect((await link(mine.id, saved.id)).status).toBe(200);
    expect(await photo(mine.id)).toMatchObject({
      recipeId: saved.id,
      kind: "recipe",
      recipe: { name: "Kodachrome 64", filmSimulation: "Classic Chrome", shadow: -1 },
    });
    expect((await list())[0].photoCount).toBe(1);
  });

  it("unlinks a photo, which keeps its copy", async () => {
    const saved = await createSavedRecipe(me.id);
    const mine = await createAsset(me.id, 0);
    await link(mine.id, saved.id);
    expect((await link(mine.id, null)).status).toBe(200);
    expect(await photo(mine.id)).toMatchObject({ recipeId: null, recipe: { name: "Kodachrome 64" } });
  });

  it("detaches a linked photo when its recipe is edited on the photo itself", async () => {
    const saved = await createSavedRecipe(me.id);
    const mine = await createAsset(me.id, 0);
    await link(mine.id, saved.id);
    const own = { name: "My tweak", filmSimulation: "Acros" };
    await PATCH_ASSET(jsonRequest("/", "PATCH", { kind: "recipe", recipe: own }), params({ id: mine.id }));
    expect(await photo(mine.id)).toMatchObject({ recipeId: null, recipe: own });
  });

  it("saves a photo's own recipe to the library and links the photo in one step", async () => {
    const mine = await createAsset(me.id, 0);
    const res = await create({ recipe: kodachrome, linkAssetId: mine.id });
    expect(res.status).toBe(201);
    const { recipe } = (await res.json()) as { recipe: Row };
    expect(await photo(mine.id)).toMatchObject({ recipeId: recipe.id, recipe: kodachrome });
  });

  it("refuses to link another creator's photo when saving (404) and saves nothing", async () => {
    const theirs = await createAsset(other.id, 0);
    expect((await create({ recipe: kodachrome, linkAssetId: theirs.id })).status).toBe(404);
    expect(await list()).toEqual([]);
  });
});

describe("editing and deleting", () => {
  it("rewrites the recipe on every linked photo when the saved recipe is edited", async () => {
    const saved = await createSavedRecipe(me.id);
    const a = await createAsset(me.id, 0);
    const b = await createAsset(me.id, 1);
    const unlinked = await createAsset(me.id, 2);
    await link(a.id, saved.id);
    await link(b.id, saved.id);

    const edited = { name: "Kodachrome 64 (warm)", filmSimulation: "Classic Chrome", whiteBalance: { mode: "Daylight", red: 3, blue: -5 } };
    expect((await update(saved.id, { recipe: edited })).status).toBe(200);
    expect((await photo(a.id)).recipe).toEqual(edited);
    expect((await photo(b.id)).recipe).toEqual(edited);
    expect((await photo(unlinked.id)).recipe).toBeNull();
  });

  it("refuses to rename a recipe to another of my recipe names (409)", async () => {
    await createSavedRecipe(me.id, "Agfa");
    const saved = await createSavedRecipe(me.id, "Kodachrome 64");
    expect((await update(saved.id, { recipe: { ...kodachrome, name: "AGFA" } })).status).toBe(409);
  });

  it("deletes a saved recipe and leaves each linked photo with a copy", async () => {
    const saved = await createSavedRecipe(me.id, "Kodachrome 64", { filmSimulation: "Classic Chrome" });
    const mine = await createAsset(me.id, 0);
    await link(mine.id, saved.id);
    expect((await remove(saved.id)).status).toBe(200);
    expect(await prisma.recipe.count({ where: { id: saved.id } })).toBe(0);
    expect(await photo(mine.id)).toMatchObject({
      recipeId: null,
      recipe: { name: "Kodachrome 64", filmSimulation: "Classic Chrome" },
    });
  });
});
