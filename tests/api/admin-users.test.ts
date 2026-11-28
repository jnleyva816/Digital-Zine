import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { PRIVATE_PATHS } from "@/lib/site/seo";
import { GET as LIST } from "@/app/api/admin/users/route";
import { POST as SET_ROLE } from "@/app/api/admin/users/[id]/role/route";
import { jsonRequest, params, resetRateLimits, sessionFor } from "./helpers";

// DIG-136: the admin panel's user list and role changes.
vi.mock("@/lib/auth/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

const PASSWORD = "correct-horse-9";
const OLD = 60 * 60 * 1000;
const RUN = randomUUID().slice(0, 8);
const created: string[] = [];

async function make(role: "user" | "admin" = "user", extra: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: {
      email: `adm-${RUN}-${randomUUID()}@test.local`,
      name: "Panel Test",
      role,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      emailVerifiedAt: new Date(),
      ...extra,
    },
  });
  created.push(user.id);
  return user;
}
type Account = Awaited<ReturnType<typeof make>>;
const signIn = (user: Account, ageMs: number | null = 0) =>
  mockedUser.mockResolvedValue(sessionFor(user, ageMs === null ? null : Date.now() - ageMs));
const list = (query = "") => LIST(new Request(`http://test.local/api/admin/users${query}`));
const setRole = (id: string, body: unknown) => SET_ROLE(jsonRequest(`/api/admin/users/${id}/role`, "POST", body), params({ id }));
const roleOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).role;
const audit = (targetId: string) => prisma.adminAction.findMany({ where: { targetId } });

beforeEach(resetRateLimits);
afterAll(async () => {
  await prisma.adminAction.deleteMany({ where: { targetId: { in: created } } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

it("keeps crawlers out of /admin", () => {
  expect(PRIVATE_PATHS).toContain("/admin");
});

describe("GET /api/admin/users", () => {
  it("returns 401 signed out and 403 to a regular user, with no users in the body", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await list()).status).toBe(401);
    signIn(await make());
    const res = await list();
    expect(res.status).toBe(403);
    expect(await res.json()).not.toHaveProperty("users");
  });

  it("sends exactly the fields the panel shows, and is never cached", async () => {
    signIn(await make("admin"));
    const target = await make("user", { googleId: `g-${randomUUID()}`, stripeCustomerId: `cus_${randomUUID()}` });
    const res = await list(`?q=${encodeURIComponent(target.email)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      users: [
        { id: target.id, name: "Panel Test", email: target.email, role: "user", tier: "free", verified: true, deactivated: false, zineCount: 0, createdAt: target.createdAt.toISOString() },
      ],
      nextCursor: null,
    });
  });

  it("searches name and email without case, and takes % and _ literally", async () => {
    signIn(await make("admin"));
    const tag = randomUUID().slice(0, 8);
    const under = await make("user", { name: `Zed_${tag}%` });
    await make("user", { name: `ZedX${tag}Y` });
    const ids = async (q: string) => ((await (await list(`?q=${encodeURIComponent(q)}`)).json()).users as { id: string }[]).map((u) => u.id);
    expect(await ids(`zed_${tag}`)).toEqual([under.id]);
    expect(await ids(`${tag}%`)).toEqual([under.id]);
    expect(await ids(under.email.toUpperCase())).toEqual([under.id]);
    expect(await ids(`nobody-${randomUUID()}`)).toEqual([]);
  });

  it("pages through everyone once, newest first, even when accounts share a moment", async () => {
    signIn(await make("admin"));
    const tag = `page-${randomUUID().slice(0, 8)}`;
    const at = new Date("2026-01-01T00:00:00.000Z");
    const all: string[] = [];
    for (let i = 0; i < 30; i++) {
      const u = await make("user", { name: tag, createdAt: i < 10 ? new Date("2026-02-01T00:00:00.000Z") : at });
      all.push(u.id);
    }
    const first = await (await list(`?q=${tag}`)).json();
    expect(first.users).toHaveLength(25);
    // The account at the cursor is deleted before the next page is read.
    await prisma.user.delete({ where: { id: first.users[24].id } });
    const second = await (await list(`?q=${tag}&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
    expect(second.users).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const seen = [...first.users, ...second.users].map((u: { id: string }) => u.id);
    expect([...seen].sort()).toEqual([...all].sort());
    const times = [...first.users, ...second.users].map((u: { createdAt: string }) => u.createdAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("refuses a bad cursor, an over-long search, and a NUL", async () => {
    signIn(await make("admin"));
    for (const q of ["?cursor=nope", "?cursor=notadate_abc", `?q=${"x".repeat(201)}`, "?q=%00"]) {
      expect((await list(q)).status, q).toBe(400);
    }
  });

  it("is rate limited", async () => {
    signIn(await make("admin"));
    let last = 200;
    for (let i = 0; i < 121; i++) last = (await list(`?q=none-${RUN}-zz`)).status;
    expect(last).toBe(429);
  });
});

describe("POST /api/admin/users/[id]/role", () => {
  it("returns 401 signed out and 403 to a regular user, who cannot promote themselves", async () => {
    const user = await make();
    mockedUser.mockResolvedValue(null);
    expect((await setRole(user.id, { role: "admin" })).status).toBe(401);
    signIn(user);
    expect((await setRole(user.id, { role: "admin", password: PASSWORD })).status).toBe(403);
    expect(await roleOf(user.id)).toBe("user");
  });

  it("grants and removes the role, and records each with IDs only", async () => {
    const admin = await make("admin");
    const target = await make();
    signIn(admin);
    const granted = await setRole(target.id, { role: "admin" });
    expect(granted.status).toBe(200);
    expect(await granted.json()).toEqual({ id: target.id, role: "admin" });
    expect(await roleOf(target.id)).toBe("admin");
    expect((await setRole(target.id, { role: "user" })).status).toBe(200);
    expect(await roleOf(target.id)).toBe("user");
    const rows = await audit(target.id);
    expect(rows.map((r) => r.action).sort()).toEqual(["grant_admin", "revoke_admin"]);
    expect(Object.keys(rows[0]).sort()).toEqual(["action", "actorId", "createdAt", "id", "targetId"]);
    expect(rows.every((r) => r.actorId === admin.id)).toBe(true);
  });

  it("keeps the record after the accounts are deleted", async () => {
    const admin = await make("admin");
    const target = await make();
    signIn(admin);
    await setRole(target.id, { role: "admin" });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, target.id] } } });
    expect(await audit(target.id)).toHaveLength(1);
  });

  it("records nothing when the role is already that", async () => {
    signIn(await make("admin"));
    const target = await make();
    expect((await setRole(target.id, { role: "user" })).status).toBe(200);
    expect(await audit(target.id)).toEqual([]);
  });

  it("validates the body and answers 404 for nobody", async () => {
    signIn(await make("admin"));
    const target = await make();
    for (const body of ["{", {}, { role: "owner" }]) expect((await setRole(target.id, body)).status).toBe(400);
    expect((await setRole("no-such-user", { role: "admin" })).status).toBe(404);
  });

  it("needs the password or a sign-in from the last five minutes, and a given password must be right", async () => {
    const admin = await make("admin");
    const target = await make();
    for (const age of [OLD, null]) {
      signIn(admin, age);
      const stale = await setRole(target.id, { role: "admin" });
      expect(stale.status).toBe(403);
      expect((await stale.json()).code).toBe("reauth_required");
    }
    signIn(admin, 0);
    const wrong = await setRole(target.id, { role: "admin", password: "nope" });
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).code).toBe("wrong_password");
    expect(await roleOf(target.id)).toBe("user");
    signIn(admin, OLD);
    expect((await setRole(target.id, { role: "admin", password: PASSWORD })).status).toBe(200);
  });

  it("makes a Google-only admin sign in again", async () => {
    const admin = await make("admin", { passwordHash: null, googleId: `g-${randomUUID()}` });
    const target = await make();
    signIn(admin, OLD);
    expect((await (await setRole(target.id, { role: "admin", password: PASSWORD })).json()).code).toBe("reauth_required");
    signIn(admin, 60_000);
    expect((await setRole(target.id, { role: "admin" })).status).toBe(200);
  });

  it("stops password guessing after 5 wrong tries, even with the right one", async () => {
    const admin = await make("admin");
    const target = await make();
    signIn(admin, OLD);
    for (let i = 0; i < 5; i++) expect((await setRole(target.id, { role: "admin", password: `no-${i}` })).status).toBe(403);
    expect((await setRole(target.id, { role: "admin", password: PASSWORD })).status).toBe(429);
    expect(await roleOf(target.id)).toBe("user");
  });

  it("rate limits role changes", async () => {
    signIn(await make("admin"));
    const target = await make();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await setRole(target.id, { role: "user" })).status;
    expect(last).toBe(429);
  });

  it("refuses to change your own role, so the last admin keeps theirs", async () => {
    const admin = await make("admin");
    signIn(admin);
    const res = await setRole(admin.id, { role: "user" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("self");
    expect(await roleOf(admin.id)).toBe("admin");
  });

  it("lets only one of two admins who remove each other at once succeed", async () => {
    const [a, b] = [await make("admin"), await make("admin")];
    mockedUser.mockResolvedValueOnce(sessionFor(a)).mockResolvedValueOnce(sessionFor(b));
    const statuses = (await Promise.all([setRole(b.id, { role: "user" }), setRole(a.id, { role: "user" })])).map((r) => r.status);
    expect(statuses.sort()).toEqual([200, 403]);
    expect([await roleOf(a.id), await roleOf(b.id)].sort()).toEqual(["admin", "user"]);
  });

  it("refuses an actor whose role was removed after their session was read", async () => {
    const admin = await make("admin");
    const target = await make();
    signIn(admin);
    await prisma.user.update({ where: { id: admin.id }, data: { role: "user" } });
    expect((await setRole(target.id, { role: "admin" })).status).toBe(403);
    expect(await roleOf(target.id)).toBe("user");
    expect(await audit(target.id)).toEqual([]);
  });

  it("will not make an account admin before its email is proven", async () => {
    signIn(await make("admin"));
    const target = await make("user", { emailVerifiedAt: null });
    const res = await setRole(target.id, { role: "admin" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("unverified");
    expect(await roleOf(target.id)).toBe("user");
  });
});
