import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { GET } from "@/app/api/sentry-test/route";
import { createTestUser, deleteTestUser, resetRateLimits } from "./helpers";

// DIG-98: a temporary route that throws, to prove production errors reach Sentry.
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
const mockedUser = vi.mocked(getAuthenticatedUser);

let me: Awaited<ReturnType<typeof createTestUser>>;
beforeAll(async () => {
  me = await createTestUser();
});
afterAll(async () => {
  await deleteTestUser(me.id);
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetRateLimits();
  mockedUser.mockResolvedValue(me);
});

describe("GET /api/sentry-test", () => {
  it("returns 401 without a session and does not throw", async () => {
    mockedUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("throws a clearly named error for a signed-in creator, so Next reports it to Sentry", async () => {
    await expect(GET()).rejects.toThrow(/Sentry test error \(DIG-98\)/);
  });

  it("is rate limited like other writes", async () => {
    for (let i = 0; i < 120; i++) await GET().catch(() => undefined);
    const res = await GET().catch((e) => e);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(429);
  });
});
