import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { PUT } from "@/app/api/uploads/local/[...key]/route";
import { POST as PRESIGN } from "@/app/api/uploads/presign/route";
import { GET as MEDIA } from "@/app/api/media/[...key]/route";
import { writeLocalObject } from "@/lib/storage/local";
import { createTestUser, deleteTestUser, jsonRequest, params, resetRateLimits } from "./helpers";

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

let me: Awaited<ReturnType<typeof createTestUser>>;
let dir: string;

beforeAll(async () => {
  me = await createTestUser();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-media-"));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await deleteTestUser(me.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetRateLimits();
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  mockedUser.mockResolvedValue(me);
});

const HTML = "<script>fetch('/api/zines').then(r=>r.text()).then(alert)</script>";
const put = (name: string, contentType: string, body = "x") =>
  PUT(
    new Request("http://test.local/", { method: "PUT", headers: { "Content-Type": contentType }, body }),
    params({ key: ["users", me.id, name] })
  );
const media = (key: string) => MEDIA(new Request(`http://test.local/api/media/${key}`), params({ key: key.split("/") }));
const exists = (name: string) =>
  fs.access(path.join(dir, "users", me.id, name)).then(
    () => true,
    () => false
  );

describe("uploads are JPEG only (DIG-36)", () => {
  it("refuses an HTML upload with 415 and writes nothing", async () => {
    const res = await put("page.html", "text/html", HTML);
    expect(res.status).toBe(415);
    expect(await exists("page.html")).toBe(false);
  });

  it("refuses a .jpg key sent with a non-JPEG content type", async () => {
    expect((await put("1-abc-photo.jpg", "text/html", HTML)).status).toBe(415);
    expect(await exists("1-abc-photo.jpg")).toBe(false);
  });

  it("refuses other image types and other extensions", async () => {
    expect((await put("1-abc-photo.png", "image/png")).status).toBe(415);
    expect((await put("1-abc-photo.svg", "image/jpeg")).status).toBe(415);
  });

  it("accepts a JPEG with a .jpg or .jpeg name", async () => {
    expect((await put("1-abc-photo.jpg", "image/jpeg")).status).toBe(200);
    expect((await put("1-abc-photo.jpeg", "image/jpeg")).status).toBe(200);
  });

  it("presigns only JPEGs", async () => {
    const presign = (contentType: string) =>
      PRESIGN(jsonRequest("/api/uploads/presign", "POST", { filename: "a.png", contentType, size: 100 }));
    for (const type of ["image/png", "image/webp", "image/gif", "image/avif", "text/html"]) {
      expect((await presign(type)).status, type).toBe(400);
    }
    expect((await presign("image/jpeg")).status).toBe(200);
  });
});

describe("serving stored files (DIG-36)", () => {
  it("never serves a stored .html file as HTML", async () => {
    await writeLocalObject(`users/${me.id}/old.html`, Buffer.from(HTML), "text/html");
    const res = await media(`users/${me.id}/old.html`);
    expect(res.headers.get("content-type") ?? "").not.toMatch(/html/);
    expect(res.status).toBe(404);
  });

  it("takes the type from the extension, not from client-written metadata", async () => {
    await writeLocalObject(`users/${me.id}/sneaky.jpg`, Buffer.from(HTML), "text/html");
    const res = await media(`users/${me.id}/sneaky.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("serves the processed AVIF copies as AVIF", async () => {
    await writeLocalObject(`users/${me.id}/up/full.avif`, Buffer.from("avif"), "image/avif");
    expect((await media(`users/${me.id}/up/full.avif`)).headers.get("content-type")).toBe("image/avif");
  });

  it("always sends nosniff and a locked-down Content-Security-Policy", async () => {
    await writeLocalObject(`users/${me.id}/ok.jpg`, Buffer.from("jpeg"), "image/jpeg");
    const res = await media(`users/${me.id}/ok.jpg`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  });
});
