import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

// DIG-106: search engines yes, AI training no, private areas never.
type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] };
const asList = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const rulesFor = (agent: string): Rule[] => {
  const rules = robots().rules;
  return (Array.isArray(rules) ? rules : [rules]).filter((r) => asList(r.userAgent).includes(agent));
};

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("lets every crawler read the site, apart from the private and transactional areas", () => {
    const [rule] = rulesFor("*");
    expect(asList(rule.allow)).toContain("/");
    for (const path of ["/api/", "/board", "/boards", "/editor", "/billing", "/recipes", "/signin", "/signup", "/verify-email", "/forgot-password", "/reset-password"]) {
      expect(asList(rule.disallow), path).toContain(path);
    }
  });

  it("does not block the files a search engine needs to render a page", () => {
    const [rule] = rulesFor("*");
    expect(asList(rule.disallow)).not.toContain("/_next/");
    expect(asList(rule.disallow)).not.toContain("/z/");
    expect(asList(rule.disallow)).not.toContain("/");
  });

  it.each([
    "GPTBot",
    "ClaudeBot",
    "anthropic-ai",
    "CCBot",
    "Google-Extended",
    "Applebot-Extended",
    "Bytespider",
    "PerplexityBot",
    "Amazonbot",
    "cohere-ai",
    "Meta-ExternalAgent",
    "Diffbot",
  ])("keeps the AI-training crawler %s out entirely", (agent) => {
    const rules = rulesFor(agent);
    expect(rules).toHaveLength(1);
    expect(asList(rules[0].disallow)).toEqual(["/"]);
    expect(asList(rules[0].allow)).toEqual([]);
  });

  it("does not name the search engines that do not train on the site", () => {
    for (const agent of ["Googlebot", "Bingbot", "DuckDuckBot", "Applebot"]) {
      expect(rulesFor(agent), agent).toHaveLength(0);
    }
  });

  it("points at the sitemap on the configured site", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://folio-digital-zine.app/");
    expect(robots().sitemap).toBe("https://folio-digital-zine.app/sitemap.xml");
  });
});
