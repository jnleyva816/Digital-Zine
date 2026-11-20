import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/health/route";

afterEach(() => vi.restoreAllMocks());

describe("GET /api/health (DIG-20)", () => {
  it("answers 200 without a session when the database responds", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 when the database is down, without leaking the error", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=secret"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ ok: false });
    expect(body).not.toMatch(/ECONNREFUSED|secret|5432/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
