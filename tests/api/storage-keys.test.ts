import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { POST as CREATE_ASSET } from "@/app/api/assets/route";
import { PUT as LOCAL_PUT } from "@/app/api/uploads/local/[...key]/route";
import { enqueueProcessing } from "@/lib/media/queue";
import { writeLocalObject } from "@/lib/storage/local";
import { createTestUser, defaultBoardId, deleteTestUser, jsonRequest, params, resetRateLimits } from "./helpers";

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/media/queue", () => ({ enqueueProcessing: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

type User = Awaited<ReturnType<typeof createTestUser>>;
let attacker: User;
let victim: User;
let dir: string;
let victimKey: string;
const VICTIM_BYTES = Buffer.from("the victim's photo");

beforeAll(async () => {
  attacker = await createTestUser();
  victim = await createTestUser();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-keys-"));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await deleteTestUser(attacker.id);
  await deleteTestUser(victim.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetRateLimits();
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  mockedUser.mockResolvedValue(attacker);
  vi.mocked(enqueueProcessing).mockResolvedValue(undefined);
  await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: [attacker.id, victim.id] } } });
  // A processed photo of the victim's, at an address any reader of their zine can see.
  victimKey = `users/${victim.id}/1795033492437-abc-harbor/full.avif`;
  await writeLocalObject(victimKey, VICTIM_BYTES, "image/avif");
});

const victimFile = () => fs.readFile(path.join(dir, victimKey));
const climbing = () => `users/${attacker.id}/../${victim.id}/1795033492437-abc-harbor/full.avif`;

describe("storage keys that climb out of the creator's folder (DIG-35)", () => {
  it("refuses the instant-delete attack (a board that does not exist) with 400 and keeps the victim's file", async () => {
    const res = await CREATE_ASSET(jsonRequest("/api/assets", "POST", { storageKey: climbing(), boardId: "no-such-board" }));
    expect(res.status).toBe(400);
    expect(await victimFile()).toEqual(VICTIM_BYTES);
  });

  it("refuses the take-and-delete attack (a real board) with 400, creates nothing, and keeps the victim's file", async () => {
    const res = await CREATE_ASSET(
      jsonRequest("/api/assets", "POST", { storageKey: climbing(), boardId: await defaultBoardId(attacker.id) })
    );
    expect(res.status).toBe(400);
    expect(await prisma.mediaAsset.count({ where: { ownerId: attacker.id } })).toBe(0);
    expect(enqueueProcessing).not.toHaveBeenCalled();
    expect(await victimFile()).toEqual(VICTIM_BYTES);
  });

  it("refuses other malformed keys with 400 before touching storage", async () => {
    for (const storageKey of [`users/${attacker.id}/./x.jpg`, `users/${attacker.id}//x.jpg`, `/users/${attacker.id}/x.jpg`, `users/${attacker.id}\\x.jpg`]) {
      const res = await CREATE_ASSET(jsonRequest("/api/assets", "POST", { storageKey }));
      expect(res.status, storageKey).toBe(400);
    }
  });

  it("refuses an encoded .. on the local upload, and does not overwrite the victim's file", async () => {
    const segments = ["users", attacker.id, "%2e%2e", victim.id, "1795033492437-abc-harbor", "full.avif"];
    const req = new Request(`http://test.local/api/uploads/local/${segments.join("/")}`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: Buffer.from("overwritten"),
    });
    const res = await LOCAL_PUT(req, params({ key: segments }));
    expect(res.status).toBe(400);
    expect(await victimFile()).toEqual(VICTIM_BYTES);
  });

  it("refuses a plain .. segment on the local upload too", async () => {
    const segments = ["users", attacker.id, "..", victim.id, "1795033492437-abc-harbor", "full.avif"];
    const req = new Request("http://test.local/api/uploads/local/x", { method: "PUT", body: Buffer.from("x") });
    expect((await LOCAL_PUT(req, params({ key: segments }))).status).toBe(400);
    expect(await victimFile()).toEqual(VICTIM_BYTES);
  });

  it("still accepts a normal upload into my own folder", async () => {
    const segments = ["users", attacker.id, "1795033492437-def-fog.jpg"];
    // JPEG uploads must say so (DIG-36).
    const req = new Request("http://test.local/api/uploads/local/x", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: Buffer.from("jpeg bytes"),
    });
    expect((await LOCAL_PUT(req, params({ key: segments }))).status).toBe(200);
  });
});
