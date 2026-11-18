import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST as PRESIGN } from "@/app/api/uploads/presign/route";
import { PUT } from "@/app/api/uploads/local/[...key]/route";
import { createTestUser, deleteTestUser, jsonRequest, params } from "./helpers";

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

beforeEach(() => {
  mockedUser.mockResolvedValue(me);
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
});

describe("POST /api/uploads/presign", () => {
  it("returns 401 without a session", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await PRESIGN(jsonRequest("/", "POST", { filename: "a.jpg", contentType: "image/jpeg" }))).status).toBe(401);
  });

  it("rejects non-image types with 400", async () => {
    const res = await PRESIGN(jsonRequest("/", "POST", { filename: "a.pdf", contentType: "application/pdf" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Only image files are supported" });
  });

  it("returns a local PUT target inside my folder", async () => {
    const res = await PRESIGN(jsonRequest("/", "POST", { filename: "cellar.jpg", contentType: "image/jpeg" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { driver: string; storageKey: string; uploadUrl: string; method: string };
    expect(body.driver).toBe("local");
    expect(body.method).toBe("PUT");
    expect(body.storageKey.startsWith(`users/${me.id}/`)).toBe(true);
    expect(body.uploadUrl).toBe(`/api/uploads/local/${body.storageKey}`);
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

  it("writes the bytes to local storage", async () => {
    const res = await put(["users", me.id, "a%20b.jpg"], "jpeg-bytes");
    expect(res.status).toBe(200);
    await expect(fs.readFile(path.join(dir, "users", me.id, "a b.jpg"), "utf8")).resolves.toBe("jpeg-bytes");
  });
});
