import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/.well-known/security.txt/route";

// DIG-104: RFC 9116, so researchers know where to report a vulnerability.
describe("GET /.well-known/security.txt", () => {
  it("is plain text and cacheable for a day", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(res.headers.get("cache-control")).toMatch(/max-age=\d+/);
  });

  it("names where to report, with GitHub's private reporting rather than anyone's email address", async () => {
    const text = await (await GET()).text();
    expect(text).toContain("Contact: https://github.com/jnleyva816/Digital-Zine/security/advisories/new");
    expect(text).toContain("Policy: https://github.com/jnleyva816/Digital-Zine/security/policy");
    expect(text).toContain("Preferred-Languages: en");
    expect(text).not.toMatch(/mailto:|@/);
  });

  it("points at itself on the configured site", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://folio-digital-zine.app/");
    expect(await (await GET()).text()).toContain("Canonical: https://folio-digital-zine.app/.well-known/security.txt");
    vi.unstubAllEnvs();
  });

  it("always has an Expires date between a month and a year ahead, as RFC 9116 asks", async () => {
    const text = await (await GET()).text();
    const expires = new Date(/^Expires: (.+)$/m.exec(text)![1]).getTime();
    const days = (expires - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(30);
    expect(days).toBeLessThan(366);
  });
});
