import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST as PRESIGN } from "@/app/api/uploads/presign/route";
import { PUT } from "@/app/api/uploads/local/[...key]/route";
import { ACCOUNT_STORAGE_BYTES, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { createAssetOfSize, createTestUser, deleteTestUser, jsonRequest, params, resetRateLimits } from "./helpers";

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

let me: Awaited<ReturnType<typeof createTestUser>>;
let dir: string;

beforeAll(async () => {
  me = await createTestUser();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-uploads-"));
});

afterAll(async () => {
  await deleteTestUser(me.id);
  await fs.rm(dir, { recursive: true, force: true });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetRateLimits();
  mockedUser.mockResolvedValue(me);
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  await prisma.mediaAsset.deleteMany({ where: { ownerId: me.id } });
});

describe("POST /api/uploads/presign", () => {
  it("returns 401 without a session", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await PRESIGN(jsonRequest("/", "POST", { filename: "a.jpg", contentType: "image/jpeg", size: 10 }))).status).toBe(401);
  });

  it("rejects non-image types with 400", async () => {
    const res = await PRESIGN(jsonRequest("/", "POST", { filename: "a.pdf", contentType: "application/pdf", size: 10 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Only JPEG photos can be uploaded." });
  });

  it("returns a local PUT target inside my folder", async () => {
    const res = await PRESIGN(jsonRequest("/", "POST", { filename: "cellar.jpg", contentType: "image/jpeg", size: 10 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { driver: string; storageKey: string; uploadUrl: string; method: string };
    expect(body.driver).toBe("local");
    expect(body.method).toBe("PUT");
    expect(body.storageKey.startsWith(`users/${me.id}/`)).toBe(true);
    expect(body.uploadUrl).toBe(`/api/uploads/local/${body.storageKey}`);
  });
});

describe("POST /api/uploads/presign limits (DIG-32)", () => {
  const presign = (size: unknown) =>
    PRESIGN(jsonRequest("/", "POST", { filename: "big.jpg", contentType: "image/jpeg", size }));

  it("requires a positive whole-number size", async () => {
    for (const size of [undefined, 0, -5, 1.5, "100"]) {
      expect((await presign(size)).status).toBe(400);
    }
  });

  it("refuses a file over 75 MB with 413", async () => {
    const res = await presign(MAX_UPLOAD_BYTES + 1);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "This file is larger than the 75 MB limit.", code: "too_large" });
  });

  it("accepts a file of exactly 75 MB", async () => {
    expect((await presign(MAX_UPLOAD_BYTES)).status).toBe(200);
  });

  it("refuses a file that would push my board past 2 GB with 403", async () => {
    await createAssetOfSize(me.id, ACCOUNT_STORAGE_BYTES - 1024 * 1024);
    const res = await presign(2 * 1024 * 1024);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Your storage is full: 1 MB of 2 GB left. Delete photos to make room.",
      code: "over_quota",
    });
  });

  it("counts only my own photos toward my quota", async () => {
    const other = await createTestUser();
    try {
      await createAssetOfSize(other.id, ACCOUNT_STORAGE_BYTES - 1);
      expect((await presign(1024)).status).toBe(200);
    } finally {
      await deleteTestUser(other.id);
    }
  });
});

describe("PUT /api/uploads/local/[...key]", () => {
  const put = (key: string[], body: BodyInit | null) =>
    PUT(new Request("http://test.local/", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body }), params({ key }));

  it("returns 401 without a session", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await put(["users", me.id, "a.jpg"], "x")).status).toBe(401);
  });

  it("refuses keys outside my folder with 403", async () => {
    expect((await put(["users", "someone-else", "a.jpg"], "x")).status).toBe(403);
  });

  it("rejects an empty body with 400", async () => {
    expect((await put(["users", me.id, "a.jpg"], null)).status).toBe(400);
  });

  it("refuses a body over 75 MB with 413 and writes nothing", async () => {
    const res = await put(["users", me.id, "huge.jpg"], new Uint8Array(MAX_UPLOAD_BYTES + 1));
    expect(res.status).toBe(413);
    await expect(fs.access(path.join(dir, "users", me.id, "huge.jpg"))).rejects.toThrow();
  });

  it("refuses a body that would push my board past 2 GB with 403 and writes nothing", async () => {
    await createAssetOfSize(me.id, ACCOUNT_STORAGE_BYTES - 10);
    const res = await put(["users", me.id, "over.jpg"], new Uint8Array(11));
    expect(res.status).toBe(403);
    await expect(fs.access(path.join(dir, "users", me.id, "over.jpg"))).rejects.toThrow();
  });

  it("writes the bytes to local storage", async () => {
    const res = await put(["users", me.id, "a%20b.jpg"], "jpeg-bytes");
    expect(res.status).toBe(200);
    await expect(fs.readFile(path.join(dir, "users", me.id, "a b.jpg"), "utf8")).resolves.toBe("jpeg-bytes");
  });
});
