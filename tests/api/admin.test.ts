import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { ensureAdmin } from "@/lib/admin/admin-account";
import { VIEW_AS_FREE_COOKIE } from "@/lib/billing/entitlements";
import { POST as VIEW_AS } from "@/app/api/admin/view-as/route";
import { createTestUser, deleteTestUser, jsonRequest } from "./helpers";

vi.mock("@/lib/auth/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

type User = Awaited<ReturnType<typeof createTestUser>>;
let regular: User;
let admin: User;
const created: string[] = [];

beforeAll(async () => {
  regular = await createTestUser();
  admin = await createTestUser();
  await prisma.user.update({ where: { id: admin.id }, data: { role: "admin" } });
  admin = { ...admin, role: "admin", tier: "pro" };
});

afterAll(async () => {
  await deleteTestUser(regular.id);
  await deleteTestUser(admin.id);
  for (const id of created) await deleteTestUser(id);
  await prisma.$disconnect();
});

beforeEach(() => {
  mockedUser.mockResolvedValue(admin);
});

const toggle = (body: unknown) => VIEW_AS(jsonRequest("/api/admin/view-as", "POST", body));

describe("POST /api/admin/view-as", () => {
  it("returns 401 when signed out", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await toggle({ viewAsFree: true })).status).toBe(401);
  });

  it("returns 403 for a regular user and sets no cookie", async () => {
    mockedUser.mockResolvedValue(regular);
    const res = await toggle({ viewAsFree: true });
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("validates the body", async () => {
    expect((await toggle({ viewAsFree: "yes" })).status).toBe(400);
    expect((await toggle("not json")).status).toBe(400);
  });

  it("turns Free view on with an httpOnly, same-site cookie", async () => {
    const res = await toggle({ viewAsFree: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewAsFree: true });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${VIEW_AS_FREE_COOKIE}=1`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it("turns Free view off by expiring the cookie", async () => {
    const res = await toggle({ viewAsFree: false });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${VIEW_AS_FREE_COOKIE}=`);
    expect(cookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});

describe("ensureAdmin", () => {
  const email = () => `admin-${randomUUID()}@test.local`;

  it("creates an admin with a random password that signs in", async () => {
    const address = email();
    const result = await ensureAdmin(prisma, { email: address });
    expect(result.created).toBe(true);
    expect(result.password).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    created.push(user.id);
    expect(user.role).toBe("admin");
    expect(await bcrypt.compare(result.password!, user.passwordHash!)).toBe(true);
    // DIG-94: password sign-in needs a verified email, and an admin made here has no inbox link.
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("normalises the email the way sign-in does", async () => {
    const address = email();
    await ensureAdmin(prisma, { email: `  ${address.toUpperCase()} ` });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    created.push(user.id);
    expect(user.role).toBe("admin");
  });

  it("promotes an existing account without touching its password", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: regular.id } });
    const result = await ensureAdmin(prisma, { email: regular.email });
    expect(result).toEqual({ created: false, promoted: true, password: null });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: regular.id } });
    expect(after.role).toBe("admin");
    expect(after.passwordHash).toBe(before.passwordHash);
    await prisma.user.update({ where: { id: regular.id }, data: { role: "user" } });
  });

  it("sets a new password with reset", async () => {
    const address = email();
    const first = await ensureAdmin(prisma, { email: address });
    const second = await ensureAdmin(prisma, { email: address, reset: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    created.push(user.id);
    expect(second.password).not.toBe(first.password);
    expect(await bcrypt.compare(second.password!, user.passwordHash!)).toBe(true);
  });

  it("rejects an invalid email", async () => {
    await expect(ensureAdmin(prisma, { email: "not-an-email" })).rejects.toThrow(/valid email/i);
  });
});
