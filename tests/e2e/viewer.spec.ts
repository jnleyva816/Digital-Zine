import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createUser, createUserWithPhotos, deleteUser, signIn, testDb, uploadAndProcess, defaultBoardId } from "./helpers";
import { publicZinePath } from "../../src/lib/public-zine-path";

test.afterAll(async () => {
  await testDb.$disconnect();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

interface ZineOptions {
  published?: boolean;
  publishedAt?: Date | null;
  description?: string | null;
  name?: string | null;
}

/**
 * A creator with a three-page zine. Page 1 flips (photo EXIF on the back),
 * page 2 has flip turned off, page 3 flips.
 */
async function arrangeZine(options: ZineOptions = {}) {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  if (options.name !== undefined) await testDb.user.update({ where: { id: user.id }, data: { name: options.name } });
  const published = options.published ?? true;
  const slug = `viewer-${randomUUID().slice(0, 8)}`;
  const zine = await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId: await defaultBoardId(user.id),
      title: "Brine & Light",
      description: options.description === undefined ? "Three plates from the pickling shelf." : options.description,
      slug,
      published,
      publishedAt: options.publishedAt === undefined ? (published ? new Date("2026-11-02T12:00:00Z") : null) : options.publishedAt,
      pages: {
        create: [
          { pageNumber: 1, content: { assetId: assets[0].id, caption: "Persimmons over coals" }, flipEnabled: true },
          { pageNumber: 2, content: { assetId: assets[1].id, caption: "The cellar at dawn" }, flipEnabled: false },
          { pageNumber: 3, content: { assetId: assets[2].id, caption: "" }, flipEnabled: true },
        ],
      },
    },
  });
  return { user, assets, zine, slug, path: publicZinePath(user.publicId, slug) };
}

function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  const tag = html.match(new RegExp(`<meta[^>]*${attr}="${key.replace(/[:]/g, "\\$&")}"[^>]*>`));
  if (!tag) return null;
  return tag[0].match(/content="([^"]*)"/)?.[1] ?? null;
}

const zinePages = (page: Page) => page.getByRole("list", { name: "Pages" }).getByRole("listitem");

test("server-rendered HTML carries Open Graph and Twitter share metadata", async ({ request, baseURL }) => {
  const { slug, assets, path } = await arrangeZine();
  const res = await request.get(path);
  expect(res.status()).toBe(200);
  const html = await res.text();

  expect(html).toMatch(/<title>Brine &amp; Light[^<]*<\/title>/);
  expect(metaContent(html, "property", "og:title")).toBe("Brine &amp; Light");
  expect(metaContent(html, "property", "og:description")).toBe("Three plates from the pickling shelf.");
  expect(metaContent(html, "property", "og:type")).toBe("article");
  expect(metaContent(html, "property", "og:url")).toBe(`${baseURL}${path}`);
  expect(metaContent(html, "property", "og:image")).toBe(`${baseURL}${assets[0].publicUrl}`);
  expect(metaContent(html, "property", "og:image:alt")).toBe("Persimmons over coals");
  expect(metaContent(html, "name", "twitter:card")).toBe("summary_large_image");
  expect(metaContent(html, "name", "twitter:image")).toBe(`${baseURL}${assets[0].publicUrl}`);
  expect(html).toContain(`<link rel="canonical" href="${baseURL}${path}"`);

  // Pages are in the server HTML, not fetched after load.
  expect(html).toContain("Persimmons over coals");
  expect(html).toContain("The cellar at dawn");

  // The OG image actually resolves.
  const image = await request.get(assets[0].publicUrl);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toMatch(/^image\//);
});

for (const crawler of ["facebookexternalhit/1.1", "Twitterbot/1.0", "Slackbot-LinkExpanding 1.0", "Discordbot/2.0"]) {
  test(`share crawler ${crawler.split("/")[0]} gets the preview tags in <head>`, async ({ request }) => {
    const { slug, path } = await arrangeZine();
    const res = await request.get(path, { headers: { "user-agent": crawler } });
    expect(res.status()).toBe(200);
    const head = (await res.text()).split("</head>")[0];
    expect(metaContent(head, "property", "og:title")).toBe("Brine &amp; Light");
    expect(metaContent(head, "property", "og:image")).not.toBeNull();
    expect(metaContent(head, "name", "twitter:card")).toBe("summary_large_image");
  });
}

test("falls back to a byline description when the zine has none", async ({ request }) => {
  const { slug, path } = await arrangeZine({ description: null, name: "Mara Ito" });
  const html = await (await request.get(path)).text();
  expect(metaContent(html, "property", "og:description")).toBe("A digital zine by Mara Ito · 3 pages");
});

test("unknown, draft, and unpublished slugs return 404", async ({ request, page }) => {
  expect((await request.get(`/z/no-such-zine-${randomUUID().slice(0, 8)}`)).status()).toBe(404);

  const draft = await arrangeZine({ published: false });
  expect((await request.get(draft.path)).status()).toBe(404);

  // Published once, then unpublished: publishedAt is kept, but the page is gone.
  const unpublished = await arrangeZine({ published: false, publishedAt: new Date("2026-10-01T00:00:00Z") });
  expect((await request.get(unpublished.path)).status()).toBe(404);

  await page.goto(draft.path);
  await expect(page.getByRole("heading", { name: "Zine not found" })).toBeVisible();
  await expect(page.getByText("Brine & Light")).toHaveCount(0);
});

test("signed-out readers see the zine with its byline, date, and pages through the image loader", async ({ page }) => {
  const { slug, assets, path } = await arrangeZine({ name: "Mara Ito" });
  await page.goto(path);

  await expect(page.getByRole("heading", { level: 1, name: "Brine & Light" })).toBeVisible();
  await expect(page.getByText("By Mara Ito")).toBeVisible();
  await expect(page.locator("time")).toHaveAttribute("datetime", "2026-11-02T12:00:00.000Z");
  await expect(page.getByText("Three plates from the pickling shelf.")).toBeVisible();
  await expect(zinePages(page)).toHaveCount(3);

  const first = zinePages(page).nth(0).getByRole("img", { name: "Persimmons over coals" });
  const src = await first.getAttribute("src");
  expect(src?.startsWith(`${assets[0].publicUrl}?w=`)).toBe(true);
  expect(src).toMatch(/\?w=\d+&q=\d+$/);
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // No studio chrome for readers.
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("omits the byline when the creator has no display name", async ({ page }) => {
  const { slug, path } = await arrangeZine({ name: null });
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: "Brine & Light" })).toBeVisible();
  await expect(page.getByText(/^By /)).toHaveCount(0);
});

test("cards flip on click, Enter, and Space; pages with flip off do not", async ({ page }) => {
  const { slug, path } = await arrangeZine();
  await page.goto(path);

  const card1 = zinePages(page).nth(0);
  const flip1 = card1.getByRole("button", { name: /^Page 1: flip/ });
  await expect(flip1).toHaveAttribute("aria-pressed", "false");
  // The reverse is hidden from assistive tech until the card is flipped.
  await expect(card1.getByRole("definition")).toHaveCount(0);

  await flip1.click();
  await expect(flip1).toHaveAttribute("aria-pressed", "true");
  await expect(card1.getByRole("definition").filter({ hasText: "ISO 200" })).toBeVisible();
  await expect(card1.getByRole("img", { name: "Persimmons over coals" })).toHaveCount(0);

  await flip1.press("Enter");
  await expect(flip1).toHaveAttribute("aria-pressed", "false");
  await expect(card1.getByRole("img", { name: "Persimmons over coals" })).toBeVisible();

  const flip3 = zinePages(page).nth(2).getByRole("button", { name: /^Page 3: flip/ });
  await flip3.focus();
  await page.keyboard.press("Space");
  await expect(flip3).toHaveAttribute("aria-pressed", "true");
  // Space toggles the card, not the page scroll position into another card's state.
  await expect(flip1).toHaveAttribute("aria-pressed", "false");

  const card2 = zinePages(page).nth(1);
  // No flip control (DIG-49: its only button is the one that opens the photo full screen).
  await expect(card2.getByRole("button", { name: /flip/i })).toHaveCount(0);
  await expect(card2.getByRole("button")).toHaveCount(1);
  await expect(card2.getByRole("button", { name: "View page 2 full screen" })).toBeVisible();
  await card2.getByRole("img", { name: "The cellar at dawn" }).click();
  await expect(card2.getByRole("img", { name: "The cellar at dawn" })).toBeVisible();
  await expect(card2.getByText(/Flip/)).toHaveCount(0);
});

test("fits a phone screen without horizontal scrolling", async ({ page }) => {
  const { slug, path } = await arrangeZine({ name: "Mara Ito" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await expect(zinePages(page)).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  const box = await zinePages(page).nth(0).boundingBox();
  expect(box?.width).toBeGreaterThan(300);
});

test("the seeded zine is publicly viewable", async ({ page }) => {
  const seeded = await testDb.user.findUniqueOrThrow({ where: { email: "creator@digitalzine.local" } });
  await page.goto(publicZinePath(seeded.publicId, "golden-hour-field-notes-issue-01"));
  await expect(page.getByRole("heading", { level: 1, name: "Golden Hour Field Notes — Issue 01" })).toBeVisible();
  await expect(zinePages(page)).toHaveCount(4);
});

test("a zine of processed photos loads a phone-sized copy and shares a JPEG preview (DIG-26)", async ({ page, baseURL }) => {
  const user = await createUser();
  cleanup.push(user.id);
  await signIn(page, user.email, user.password);
  const asset = await uploadAndProcess(page, user.id, "cover.jpg");
  const slug = `processed-${randomUUID().slice(0, 8)}`;
  await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId: await defaultBoardId(user.id),
      title: "Processed",
      slug,
      published: true,
      publishedAt: new Date(),
      pages: { create: [{ pageNumber: 1, content: { assetId: asset.id, caption: "Blue hour" } }] },
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const copy = page.waitForResponse((r) => /\/w\d+\.avif/.test(r.url()));
  await page.goto(publicZinePath(user.publicId, slug));
  const res = await copy;
  // 390 px wide at 1x needs the 480 px copy, never the 2400 px original size.
  expect(res.url()).toMatch(/\/w480\.avif/);
  expect(res.headers()["content-type"]).toBe("image/avif");

  const html = await (await page.request.get(publicZinePath(user.publicId, slug))).text();
  const ogImage = metaContent(html, "property", "og:image");
  expect(ogImage).toBe(`${baseURL}${asset.publicUrl.replace(/\/full\.avif$/, "/og.jpg")}`);
  const og = await page.request.get(ogImage!);
  expect(og.headers()["content-type"]).toBe("image/jpeg");
});
