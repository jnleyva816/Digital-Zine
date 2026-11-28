import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { createUserWithPhotos, deleteUser, testDb, defaultBoardId } from "./helpers";
import { publicZinePath } from "../../src/lib/zine/public-zine-path";

/** DIG-106: robots.txt, sitemap.xml, JSON-LD, llms.txt, and per-page titles and canonicals. */
test.afterAll(async () => {
  await testDb.$disconnect();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

async function arrangeZine(published: boolean) {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  await testDb.user.update({ where: { id: user.id }, data: { name: "Mara Ito" } });
  const slug = `seo-${randomUUID().slice(0, 8)}`;
  await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId: await defaultBoardId(user.id),
      title: "Brine & Light",
      description: "Three plates from the pickling shelf.",
      slug,
      published,
      publishedAt: published ? new Date("2026-11-02T12:00:00Z") : null,
      pages: { create: [{ pageNumber: 1, content: { assetId: assets[0].id, caption: "Persimmons over coals" } }] },
    },
  });
  return { user, assets, slug, path: publicZinePath(user.publicId, slug) };
}

function jsonLdBlocks(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

const text = async (request: APIRequestContext, path: string) => {
  const res = await request.get(path);
  expect(res.status(), path).toBe(200);
  return { res, body: await res.text() };
};

test.describe("robots.txt", () => {
  test("allows crawlers, hides private areas, turns AI training away, and names the sitemap", async ({ request, baseURL }) => {
    const { res, body } = await text(request, "/robots.txt");
    expect(res.headers()["content-type"]).toMatch(/^text\/plain/);
    expect(body).toMatch(/User-Agent: \*\s+Allow: \/\s/i);
    for (const path of ["/api/", "/board", "/boards", "/editor", "/billing", "/recipes", "/signin", "/signup", "/verify-email"]) {
      expect(body, path).toContain(`Disallow: ${path}\n`);
    }
    for (const agent of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "Applebot-Extended", "Bytespider", "PerplexityBot", "Amazonbot"]) {
      expect(body, agent).toMatch(new RegExp(`User-Agent: ${agent}\\s+Disallow: /\\s`, "i"));
    }
    expect(body).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
  });
});

test.describe("sitemap.xml", () => {
  test("lists the public pages and a published zine, and never a draft", async ({ request, baseURL }) => {
    const published = await arrangeZine(true);
    const draft = await arrangeZine(false);
    const { res, body } = await text(request, "/sitemap.xml");
    expect(res.headers()["content-type"]).toMatch(/xml/);
    expect(body).toContain("<urlset");
    for (const path of ["/", "/terms", "/privacy"]) expect(body).toContain(`<loc>${baseURL}${path === "/" ? "/" : path}</loc>`);
    expect(body).toContain(`<loc>${baseURL}${published.path}</loc>`);
    expect(body).toMatch(new RegExp(`<loc>${baseURL}${published.path}</loc>\\s*<lastmod>\\d{4}-\\d{2}-\\d{2}T`));
    expect(body).not.toContain(draft.slug);
  });

  test("follows a zine being unpublished and published again", async ({ request, baseURL }) => {
    const { path, slug, user } = await arrangeZine(true);
    expect((await text(request, "/sitemap.xml")).body).toContain(`<loc>${baseURL}${path}</loc>`);
    await testDb.zine.updateMany({ where: { ownerId: user.id, slug }, data: { published: false } });
    expect((await text(request, "/sitemap.xml")).body).not.toContain(slug);
    await testDb.zine.updateMany({ where: { ownerId: user.id, slug }, data: { published: true } });
    expect((await text(request, "/sitemap.xml")).body).toContain(`<loc>${baseURL}${path}</loc>`);
  });
});

test.describe("structured data", () => {
  test("a public zine carries valid JSON-LD with its public details and nothing private", async ({ request, baseURL }) => {
    const { path, user, assets } = await arrangeZine(true);
    const { body: html } = await text(request, path);
    const blocks = jsonLdBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      "@context": "https://schema.org",
      "@type": "ImageGallery",
      name: "Brine & Light",
      description: "Three plates from the pickling shelf.",
      url: `${baseURL}${path}`,
      datePublished: "2026-11-02T12:00:00.000Z",
      author: { "@type": "Person", name: "Mara Ito" },
      image: `${baseURL}${assets[0].publicUrl}`,
    });
    // The photo's address already carries the storage path, as the page's own og:image does. Everything
    // else must hold no email and no internal ID.
    const { image: _image, ...rest } = blocks[0] as Record<string, unknown>;
    const json = JSON.stringify(rest);
    expect(JSON.stringify(blocks[0])).not.toContain(user.email);
    expect(json).not.toContain(user.id);
  });

  test("the landing page carries a WebSite and an Organization", async ({ request, baseURL }) => {
    const { body: html } = await text(request, "/");
    const [graph] = jsonLdBlocks(html) as Array<{ "@graph": Array<{ "@type": string; url: string }> }>;
    expect(graph["@graph"].map((n) => n["@type"]).sort()).toEqual(["Organization", "WebSite"]);
    for (const node of graph["@graph"]) expect(node.url).toBe(`${baseURL}/`);
  });

  test("the structured data does not trip the enforced Content Security Policy", async ({ page }) => {
    const { path } = await arrangeZine(true);
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        (window as unknown as { __csp: string[] }).__csp = [...((window as unknown as { __csp?: string[] }).__csp ?? []), e.violatedDirective];
      });
    });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "Brine & Light" })).toBeVisible();
    violations.push(...((await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp)) ?? []));
    expect(violations).toEqual([]);
  });
});

test.describe("page metadata", () => {
  test("every public page has its own title, a canonical address, and a language", async ({ request, baseURL }) => {
    const { path } = await arrangeZine(true);
    const pages = ["/", "/terms", "/privacy", "/signin", "/signup", path];
    const titles: string[] = [];
    for (const page of pages) {
      const { body: html } = await text(request, page);
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
      expect(title, `${page} has a title`).toBeTruthy();
      titles.push(title!);
      expect(html, `${page} sets lang`).toMatch(/<html lang="en"/);
      expect(html.match(/<meta name="description" content="[^"]+"/), `${page} has a description`).not.toBeNull();
    }
    expect(new Set(titles).size, titles.join(" | ")).toBe(pages.length);

    for (const page of ["/", "/terms", "/privacy", path]) {
      const { body: html } = await text(request, page);
      // Next writes the site root without its trailing slash, which is the same address.
      const canonical = `${baseURL}${page === "/" ? "" : page}`;
      expect(html, `${page} canonical`).toContain(`<link rel="canonical" href="${canonical}"`);
    }
  });
});

test.describe("llms.txt", () => {
  test("is served as plain text, describes the product, and states the AI-training stance", async ({ request, baseURL }) => {
    const { res, body } = await text(request, "/llms.txt");
    expect(res.headers()["content-type"]).toMatch(/^text\/plain/);
    expect(body.startsWith("# Folio\n")).toBe(true);
    expect(body).toContain(`${baseURL}/terms`);
    expect(body).toMatch(/AI training/i);
    expect(body).not.toContain("/z/");
  });
});
