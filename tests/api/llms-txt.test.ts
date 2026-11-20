import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/llms.txt/route";

// DIG-106: llms.txt (https://llmstxt.org) for assistants that answer questions about Folio.
const SITE = "https://folio-digital-zine.app";

async function body() {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", SITE);
  return (await GET()).text();
}

afterEach(() => vi.unstubAllEnvs());

describe("GET /llms.txt", () => {
  it("is plain text and cacheable", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", SITE);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain; charset=utf-8/);
    expect(res.headers.get("cache-control")).toMatch(/max-age=\d+/);
  });

  it("opens with a title and a one-paragraph summary, as the convention asks", async () => {
    const lines = (await body()).split("\n");
    expect(lines[0]).toBe("# Folio");
    expect(lines[1]).toBe("");
    expect(lines[2]).toMatch(/^> .{80,}/);
    expect(lines[3]).toBe("");
  });

  it("has a section each for what Folio is, how it works, pricing, and legal, each with described links", async () => {
    const text = await body();
    const sections = text.split(/^## /m).slice(1);
    const names = sections.map((s) => s.split("\n")[0]);
    expect(names).toEqual(["What Folio is", "How it works", "Pricing", "Legal", "AI training"]);
    for (const section of sections.slice(0, 4)) {
      const links = section.split("\n").filter((l) => l.startsWith("- "));
      expect(links.length, section.split("\n")[0]).toBeGreaterThan(0);
      for (const link of links) expect(link).toMatch(/^- \[[^\]]+\]\(https:\/\/folio-digital-zine\.app[^)]*\): \S.+/);
    }
  });

  it("links the pages that exist, and nothing else on the site", async () => {
    const text = await body();
    const targets = [...text.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => m[1]);
    expect(targets).toEqual(expect.arrayContaining([`${SITE}/`, `${SITE}/#pricing`, `${SITE}/terms`, `${SITE}/privacy`]));
    // Compare the parsed origin, not a string prefix: "https://folio-digital-zine.app.evil.test" starts with the site.
    for (const target of targets) expect(new URL(target).origin, target).toBe(SITE);
    // Creators' zines are not listed, and neither is anything behind a sign-in.
    expect(text).not.toMatch(/\/z\//);
    expect(text).not.toMatch(/\/(board|boards|editor|billing|recipes|api)\b/);
  });

  it("states the AI-training stance", async () => {
    const text = await body();
    expect(text).toMatch(/not (?:available|permitted|licensed)[^.]*AI training|AI training[^.]*not/i);
    expect(text).toContain(`${SITE}/robots.txt`);
  });

  it("describes the product without pretending to features it does not have", async () => {
    const text = await body();
    expect(text).toMatch(/zine/i);
    expect(text).toMatch(/Fujifilm/i);
    expect(text).not.toMatch(/print|payout|marketplace/i);
  });
});
