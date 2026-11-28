import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PUT as putAccess } from "@/app/api/zines/[id]/access/route";
import { GET as getZine, PATCH as patchZine } from "@/app/api/zines/[id]/route";
import { POST as unlock } from "@/app/api/z/[owner]/[slug]/unlock/route";
import sitemap from "@/app/sitemap";
import { getPublicProfile } from "@/lib/public-profile";
import { legacyZineAddress } from "@/lib/legacy-zine-url";
import { getPublicZine } from "@/lib/public-zine";
import { publicZinePath } from "@/lib/public-zine-path";
import { isUnlocked, unlockCookieName } from "@/lib/zine-access";
import { createAsset, createTestUser, deleteTestUser, jsonRequest, params, resetRateLimits, sessionFor } from "./helpers";

// DIG-112: private zines, readable only with the creator's code. Every place a published zine can
// show up is checked here, so a private one never leaks its title, photos, or address.
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

const TAG = randomUUID().replaceAll("-", "").slice(0, 8);
let owner: Awaited<ReturnType<typeof createTestUser>>;
let other: Awaited<ReturnType<typeof createTestUser>>;
let handle: string;
let assetId: string;

beforeAll(async () => {
  handle = `priv_${TAG}`;
  const user = await prisma.user.create({
    data: {
      email: `priv-${TAG}@test.local`,
      name: "Ana Ruiz",
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      handle,
      handles: { create: [{ handle }] },
    },
  });
  owner = sessionFor(user);
  other = await createTestUser();
  assetId = (await createAsset(owner.id, 0)).id;
});

afterAll(async () => {
  await deleteTestUser(owner.id);
  await deleteTestUser(other.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetRateLimits();
  mockedUser.mockResolvedValue(owner);
});

/** A published zine with one photo, public unless a code hash is given. */
async function published(title: string) {
  return prisma.zine.create({
    data: {
      ownerId: owner.id,
      boardId: (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } })).boardId,
      title,
      description: `About ${title}`,
      slug: `z-${randomUUID().slice(0, 8)}`,
      published: true,
      publishedAt: new Date(),
      pages: { create: [{ pageNumber: 1, content: { assetId, caption: "" } }] },
    },
  });
}

const setAccess = (id: string, body: unknown) => putAccess(jsonRequest(`/api/zines/${id}/access`, "PUT", body), params({ id }));

async function makePrivate(title: string, code = "harbor-dusk") {
  const zine = await published(title);
  const res = await setAccess(zine.id, { visibility: "private", code });
  expect(res.status).toBe(200);
  return zine;
}

let ipCounter = 0;
function unlockRequest(zine: { slug: string }, code: unknown, ip = `198.51.100.${++ipCounter % 250}`) {
  const req = new Request(`http://test.local/api/z/${owner.publicId}/${zine.slug}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ code }),
  });
  return unlock(req, params({ owner: owner.publicId, slug: zine.slug }));
}

describe("PUT /api/zines/[id]/access", () => {
  it("needs a signed-in creator", async () => {
    const zine = await published("Signed out");
    mockedUser.mockResolvedValue(null);
    expect((await setAccess(zine.id, { visibility: "private", code: "harbor-dusk" })).status).toBe(401);
  });

  it("does not let one creator change another's zine", async () => {
    const zine = await published("Not yours");
    mockedUser.mockResolvedValue(other);
    expect((await setAccess(zine.id, { visibility: "private", code: "harbor-dusk" })).status).toBe(404);
    expect((await prisma.zine.findUniqueOrThrow({ where: { id: zine.id } })).visibility).toBe("public");
  });

  it("refuses a private zine without a code, and a code that is too short", async () => {
    const zine = await published("No code");
    const none = await setAccess(zine.id, { visibility: "private" });
    expect(none.status).toBe(400);
    expect((await none.json()).error).toMatch(/code/i);
    expect((await setAccess(zine.id, { visibility: "private", code: "abc" })).status).toBe(400);
    expect((await setAccess(zine.id, { visibility: "hidden" })).status).toBe(400);
    expect((await prisma.zine.findUniqueOrThrow({ where: { id: zine.id } })).visibility).toBe("public");
  });

  it("stores only a hash of the code, and never sends it back", async () => {
    const zine = await published("Hashed");
    const res = await setAccess(zine.id, { visibility: "private", code: "harbor-dusk" });
    const body = await res.json();
    expect(body).toEqual({ visibility: "private", hasAccessCode: true });
    const row = await prisma.zine.findUniqueOrThrow({ where: { id: zine.id } });
    expect(row.accessCodeHash).toBeTruthy();
    expect(row.accessCodeHash).not.toContain("harbor-dusk");
  });

  it("keeps the code when a private zine is saved again without one", async () => {
    const zine = await makePrivate("Kept");
    const before = await prisma.zine.findUniqueOrThrow({ where: { id: zine.id } });
    const res = await setAccess(zine.id, { visibility: "private" });
    expect(res.status).toBe(200);
    const after = await prisma.zine.findUniqueOrThrow({ where: { id: zine.id } });
    expect(after.accessCodeHash).toBe(before.accessCodeHash);
    expect(after.accessCodeVersion).toBe(before.accessCodeVersion);
  });

  it("making a zine public again forgets the code", async () => {
    const zine = await makePrivate("Public again");
    const res = await setAccess(zine.id, { visibility: "public" });
    expect(await res.json()).toEqual({ visibility: "public", hasAccessCode: false });
    expect((await prisma.zine.findUniqueOrThrow({ where: { id: zine.id } })).accessCodeHash).toBeNull();
  });
});

describe("the zine API never sends the code hash", () => {
  it("GET and PATCH leave it out", async () => {
    const zine = await makePrivate("Editor read");
    const got = await (await getZine(jsonRequest(`/api/zines/${zine.id}`, "GET"), params({ id: zine.id }))).json();
    expect(got.zine).not.toHaveProperty("accessCodeHash");
    expect(got.zine).toMatchObject({ visibility: "private" });
    const patched = await (
      await patchZine(jsonRequest(`/api/zines/${zine.id}`, "PATCH", { title: "Renamed" }), params({ id: zine.id }))
    ).json();
    expect(patched.zine).not.toHaveProperty("accessCodeHash");
  });
});

describe("POST /api/z/[owner]/[slug]/unlock", () => {
  it("refuses a request with no code", async () => {
    const zine = await makePrivate("No body");
    expect((await unlockRequest(zine, undefined)).status).toBe(400);
    expect((await unlockRequest(zine, "")).status).toBe(400);
  });

  it("is a 404 for a zine that is public, unpublished, or unknown", async () => {
    const open = await published("Open");
    expect((await unlockRequest(open, "harbor-dusk")).status).toBe(404);
    const hidden = await makePrivate("Unpublished");
    await prisma.zine.update({ where: { id: hidden.id }, data: { published: false } });
    expect((await unlockRequest(hidden, "harbor-dusk")).status).toBe(404);
    expect((await unlockRequest({ slug: "no-such-zine" }, "harbor-dusk")).status).toBe(404);
  });

  it("refuses a wrong code without setting a cookie", async () => {
    const zine = await makePrivate("Wrong");
    const res = await unlockRequest(zine, "harbor-dawn");
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("a right code sets a signed, HttpOnly cookie scoped to that zine's page for 30 days", async () => {
    const zine = await makePrivate("Right");
    const res = await unlockRequest(zine, "harbor-dusk");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${unlockCookieName(zine.id)}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toContain(`Path=${publicZinePath(owner.publicId, zine.slug)}`);
    expect(cookie).toContain("Max-Age=2592000");
    const token = decodeURIComponent(cookie.split(";")[0].split("=")[1]);
    const row = await prisma.zine.findUniqueOrThrow({ where: { id: zine.id } });
    expect(isUnlocked(token, zine.id, row.accessCodeVersion)).toBe(true);
  });

  it("changing the code ends earlier unlocks, and only the new code works", async () => {
    const zine = await makePrivate("Changed");
    const first = await unlockRequest(zine, "harbor-dusk");
    const token = decodeURIComponent((first.headers.get("set-cookie") ?? "").split(";")[0].split("=")[1]);
    expect((await setAccess(zine.id, { visibility: "private", code: "new-code-42" })).status).toBe(200);
    const row = await prisma.zine.findUniqueOrThrow({ where: { id: zine.id } });
    expect(isUnlocked(token, zine.id, row.accessCodeVersion)).toBe(false);
    expect((await unlockRequest(zine, "harbor-dusk")).status).toBe(401);
    expect((await unlockRequest(zine, "new-code-42")).status).toBe(200);
  });

  it("limits one IP to 10 tries in 15 minutes, even with the right code after", async () => {
    const zine = await makePrivate("Per IP");
    for (let i = 0; i < 10; i++) expect((await unlockRequest(zine, `guess-${i}xx`, "203.0.113.9")).status).toBe(401);
    const blocked = await unlockRequest(zine, "harbor-dusk", "203.0.113.9");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(blocked.headers.get("set-cookie")).toBeNull();
  });

  it("limits one zine to 30 wrong tries in 15 minutes, across many IPs", async () => {
    const zine = await makePrivate("Per zine");
    for (let i = 0; i < 30; i++) {
      expect((await unlockRequest(zine, `guess-${i}xx`, `192.0.2.${i + 1}`)).status).toBe(401);
    }
    expect((await unlockRequest(zine, "harbor-dusk", "192.0.2.200")).status).toBe(429);
    // Another zine is not affected.
    const fine = await makePrivate("Unaffected");
    expect((await unlockRequest(fine, "harbor-dusk", "192.0.2.201")).status).toBe(200);
  }, 60_000);
});

describe("a private zine is absent from every public list", () => {
  it("is left out of the sitemap", async () => {
    const open = await published("Listed");
    const closed = await makePrivate("Unlisted");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith(publicZinePath(owner.publicId, open.slug)))).toBe(true);
    expect(urls.some((u) => u.endsWith(publicZinePath(owner.publicId, closed.slug)))).toBe(false);
  });

  it("is left out of the creator's profile", async () => {
    const open = await published("On profile");
    const closed = await makePrivate("Off profile");
    const found = await getPublicProfile(handle);
    expect(found?.kind).toBe("profile");
    const paths = found?.kind === "profile" ? found.profile.zines.map((z) => z.path) : [];
    expect(paths).toContain(publicZinePath(owner.publicId, open.slug));
    expect(paths).not.toContain(publicZinePath(owner.publicId, closed.slug));
  });

  it("is not found by its old /z/<slug> address", async () => {
    const closed = await makePrivate("Old link");
    expect(await legacyZineAddress(closed.slug)).toBeNull();
  });

  it("tells the viewer it is private and which code version opens it", async () => {
    const closed = await makePrivate("Viewer");
    const zine = await getPublicZine(owner.publicId, closed.slug);
    const row = await prisma.zine.findUniqueOrThrow({ where: { id: closed.id } });
    expect(zine).toMatchObject({ id: closed.id, visibility: "private", accessCodeVersion: row.accessCodeVersion });
  });
});
