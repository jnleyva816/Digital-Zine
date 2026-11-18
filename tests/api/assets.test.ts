import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { GET, POST } from "@/app/api/assets/route";
import { DELETE, PATCH } from "@/app/api/assets/[id]/route";
import { POST as REORDER } from "@/app/api/assets/reorder/route";
import { POST as PROCESS } from "@/app/api/assets/[id]/process/route";
import { enqueueProcessing } from "@/lib/media/queue";
import { BOARD_STORAGE_BYTES } from "@/lib/limits";
import { writeLocalObject } from "@/lib/storage/local";
import {
  createAsset,
  createAssetOfSize,
  createTestUser,
  createZineUsing,
  deleteTestUser,
  jsonRequest,
  params,
} from "./helpers";

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
// The real queue is pg-boss; these tests check what is sent to it (DIG-26).
vi.mock("@/lib/media/queue", () => ({ enqueueProcessing: vi.fn() }));
const enqueue = vi.mocked(enqueueProcessing);
const mockedUser = vi.mocked(getAuthenticatedUser);

let me: Awaited<ReturnType<typeof createTestUser>>;
let other: Awaited<ReturnType<typeof createTestUser>>;
let dir: string;

/** Puts bytes in local storage, as the upload step would, so asset create can measure them. */
const stored = async (key: string, bytes = 1234) => {
  await writeLocalObject(key, Buffer.alloc(bytes), "image/jpeg");
  return key;
};

beforeAll(async () => {
  me = await createTestUser();
  other = await createTestUser();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-assets-"));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await deleteTestUser(me.id);
  await deleteTestUser(other.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  mockedUser.mockResolvedValue(me);
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: [me.id, other.id] } } });
  await prisma.zine.deleteMany({ where: { ownerId: { in: [me.id, other.id] } } });
});

describe("auth", () => {
  it("returns 401 on every asset route without a session", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(jsonRequest("/api/assets", "POST", {}))).status).toBe(401);
    expect((await PATCH(jsonRequest("/api/assets/x", "PATCH", {}), params({ id: "x" }))).status).toBe(401);
    expect((await DELETE(jsonRequest("/api/assets/x", "DELETE"), params({ id: "x" }))).status).toBe(401);
    expect((await REORDER(jsonRequest("/api/assets/reorder", "POST", { orderedIds: ["x"] }))).status).toBe(401);
  });
});

describe("GET /api/assets", () => {
  it("lists only my assets, in sort order", async () => {
    await createAsset(me.id, 1, "second.jpg");
    await createAsset(me.id, 0, "first.jpg");
    await createAsset(other.id, 0, "theirs.jpg");
    const res = await GET();
    expect(res.status).toBe(200);
    const { assets } = (await res.json()) as { assets: { originalName: string }[] };
    expect(assets.map((a) => a.originalName)).toEqual(["first.jpg", "second.jpg"]);
  });
});

describe("POST /api/assets", () => {
  it("rejects an invalid payload with 400", async () => {
    expect((await POST(jsonRequest("/api/assets", "POST", "not json"))).status).toBe(400);
    expect((await POST(jsonRequest("/api/assets", "POST", { storageKey: "" }))).status).toBe(400);
  });

  it("rejects a storage key outside my folder with 403", async () => {
    const res = await POST(jsonRequest("/api/assets", "POST", { storageKey: `users/${other.id}/x.jpg` }));
    expect(res.status).toBe(403);
  });

  it("creates the asset at the end of the board with its EXIF", async () => {
    await createAsset(me.id, 4);
    const res = await POST(
      jsonRequest("/api/assets", "POST", {
        storageKey: await stored(`users/${me.id}/new.jpg`),
        originalName: "new.jpg",
        mimeType: "image/jpeg",
        exif: { iso: 800, aperture: "f/4" },
      })
    );
    expect(res.status).toBe(201);
    const { asset } = (await res.json()) as { asset: { sortOrder: number; publicUrl: string; exif: unknown } };
    expect(asset.sortOrder).toBe(5);
    expect(asset.publicUrl).toBe(`/api/media/users/${me.id}/new.jpg`);
    expect(asset.exif).toEqual({ iso: 800, aperture: "f/4" });
  });

  it("records the size that is actually in storage, not one the client sends (DIG-32)", async () => {
    const res = await POST(
      jsonRequest("/api/assets", "POST", { storageKey: await stored(`users/${me.id}/sized.jpg`, 4321), sizeBytes: 1 })
    );
    expect(res.status).toBe(201);
    const { asset } = (await res.json()) as { asset: { sizeBytes: number } };
    expect(asset.sizeBytes).toBe(4321);
  });

  it("refuses with 400 when nothing was uploaded under that key (DIG-32)", async () => {
    const res = await POST(jsonRequest("/api/assets", "POST", { storageKey: `users/${me.id}/never-uploaded.jpg` }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "The upload was not found. Try uploading the photo again." });
  });

  it("refuses with 403 and deletes the upload when it would push my board past 2 GB (DIG-32)", async () => {
    await createAssetOfSize(me.id, BOARD_STORAGE_BYTES - 100);
    const key = await stored(`users/${me.id}/over.jpg`, 200);
    const res = await POST(jsonRequest("/api/assets", "POST", { storageKey: key }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("over_quota");
    await expect(fs.access(path.join(dir, key))).rejects.toThrow();
    expect(await prisma.mediaAsset.count({ where: { storageKey: key } })).toBe(0);
  });
});

describe("PATCH /api/assets/[id]", () => {
  it("returns 404 for another user's asset", async () => {
    const theirs = await createAsset(other.id, 0);
    const res = await PATCH(jsonRequest("/", "PATCH", { kind: "recipe" }), params({ id: theirs.id }));
    expect(res.status).toBe(404);
  });

  it("rejects a recipe the camera can't produce, and old food recipes, with 400", async () => {
    const mine = await createAsset(me.id, 0);
    for (const recipe of [
      { name: "x".repeat(81), filmSimulation: "Classic Chrome" },
      { name: "Bad sim", filmSimulation: "Kodak Gold" },
      { name: "Bad tone", filmSimulation: "Classic Chrome", highlight: 0.25 },
      { title: "Kraut", ingredients: ["cabbage"], method: ["shred"] },
    ]) {
      const res = await PATCH(jsonRequest("/", "PATCH", { kind: "recipe", recipe }), params({ id: mine.id }));
      expect(res.status, JSON.stringify(recipe)).toBe(400);
    }
    expect(await prisma.mediaAsset.findUnique({ where: { id: mine.id } })).toMatchObject({ kind: "photo", recipe: null });
  });

  it("creates an asset with a Fujifilm recipe", async () => {
    const recipe = { name: "Portra 400", filmSimulation: "Classic Neg.", grain: "Weak, Small", shadow: -1 };
    const res = await POST(
      jsonRequest("/api/assets", "POST", { storageKey: await stored(`users/${me.id}/portra.jpg`), kind: "recipe", recipe })
    );
    expect(res.status).toBe(201);
    const { asset } = (await res.json()) as { asset: { id: string } };
    expect(await prisma.mediaAsset.findUnique({ where: { id: asset.id } })).toMatchObject({ kind: "recipe", recipe });
  });

  it("sets and then clears a recipe", async () => {
    const mine = await createAsset(me.id, 0);
    const recipe = {
      name: "Kodachrome 64",
      filmSimulation: "Classic Chrome",
      whiteBalance: { mode: "Kelvin", kelvin: 5200, red: 2, blue: -5 },
      exposureCompensation: "0 to +2/3",
    };
    let res = await PATCH(jsonRequest("/", "PATCH", { kind: "recipe", recipe }), params({ id: mine.id }));
    expect(res.status).toBe(200);
    expect(await prisma.mediaAsset.findUnique({ where: { id: mine.id } })).toMatchObject({ kind: "recipe", recipe });

    res = await PATCH(jsonRequest("/", "PATCH", { kind: "photo", recipe: null }), params({ id: mine.id }));
    expect(res.status).toBe(200);
    expect(await prisma.mediaAsset.findUnique({ where: { id: mine.id } })).toMatchObject({ kind: "photo", recipe: null });
  });
});

describe("processing after upload (DIG-26)", () => {
  it("saves a new upload as processing and queues it for the worker", async () => {
    enqueue.mockResolvedValue(undefined);
    const res = await POST(jsonRequest("/api/assets", "POST", { storageKey: await stored(`users/${me.id}/queued.jpg`) }));
    expect(res.status).toBe(201);
    const { asset } = (await res.json()) as { asset: { id: string; status: string } };
    expect(asset.status).toBe("processing");
    expect(enqueue).toHaveBeenCalledWith(asset.id);
  });

  it("marks the upload failed, so the owner can retry, when the queue is unavailable", async () => {
    enqueue.mockRejectedValue(new Error("queue down"));
    const res = await POST(jsonRequest("/api/assets", "POST", { storageKey: await stored(`users/${me.id}/stuck.jpg`) }));
    expect(res.status).toBe(201);
    const { asset } = (await res.json()) as { asset: { id: string; status: string; processingError: string } };
    expect(asset).toMatchObject({ status: "failed", processingError: "Processing could not start. Try again." });
  });
});

describe("POST /api/assets/[id]/process (DIG-26)", () => {
  const retry = (id: string) => PROCESS(jsonRequest("/", "POST"), params({ id }));
  const failed = async (ownerId: string) => {
    const asset = await createAsset(ownerId, 0);
    return prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: "failed", processingError: "This file could not be read as an image." },
    });
  };

  it("returns 401 without a session", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await retry("anything")).status).toBe(401);
  });

  it("returns 404 for another user's photo and does not queue it", async () => {
    const theirs = await failed(other.id);
    expect((await retry(theirs.id)).status).toBe(404);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("refuses with 409 unless processing failed", async () => {
    const ready = await createAsset(me.id, 0);
    const res = await retry(ready.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Only a photo whose processing failed can be retried." });
  });

  it("queues a failed photo again and clears its error", async () => {
    enqueue.mockResolvedValue(undefined);
    const mine = await failed(me.id);
    const res = await retry(mine.id);
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ asset: { id: mine.id, status: "processing", processingError: null } });
    expect(enqueue).toHaveBeenCalledWith(mine.id);
  });
});

describe("DELETE /api/assets/[id]", () => {
  it("returns 404 for another user's asset and leaves it alone", async () => {
    const theirs = await createAsset(other.id, 0);
    expect((await DELETE(jsonRequest("/", "DELETE"), params({ id: theirs.id }))).status).toBe(404);
    expect(await prisma.mediaAsset.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });

  it("refuses with 409 and names the zine when a zine page uses the asset", async () => {
    const mine = await createAsset(me.id, 0);
    const zine = await createZineUsing(me.id, mine.id, "Winter Pickles");
    const res = await DELETE(jsonRequest("/", "DELETE"), params({ id: mine.id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "This photo is used in “Winter Pickles”. Remove it from that zine before deleting it.",
      zineId: zine.id,
    });
    expect(await prisma.mediaAsset.findUnique({ where: { id: mine.id } })).not.toBeNull();
  });

  it("deletes an unused asset", async () => {
    const mine = await createAsset(me.id, 0);
    const res = await DELETE(jsonRequest("/", "DELETE"), params({ id: mine.id }));
    expect(res.status).toBe(200);
    expect(await prisma.mediaAsset.findUnique({ where: { id: mine.id } })).toBeNull();
  });
});

describe("POST /api/assets/reorder", () => {
  it("rejects an empty list with 400", async () => {
    expect((await REORDER(jsonRequest("/", "POST", { orderedIds: [] }))).status).toBe(400);
  });

  it("applies my order and ignores ids I do not own", async () => {
    const a = await createAsset(me.id, 0, "a.jpg");
    const b = await createAsset(me.id, 1, "b.jpg");
    const c = await createAsset(me.id, 2, "c.jpg");
    const theirs = await createAsset(other.id, 7, "theirs.jpg");
    const res = await REORDER(jsonRequest("/", "POST", { orderedIds: [c.id, theirs.id, a.id, b.id] }));
    expect(res.status).toBe(200);
    const rows = await prisma.mediaAsset.findMany({ where: { ownerId: me.id }, orderBy: { sortOrder: "asc" } });
    expect(rows.map((r) => r.originalName)).toEqual(["c.jpg", "a.jpg", "b.jpg"]);
    expect((await prisma.mediaAsset.findUnique({ where: { id: theirs.id } }))?.sortOrder).toBe(7);
  });
});
