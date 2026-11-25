import { expect, test, type Page } from "@playwright/test";
import { seedLargeBoard } from "../../scripts/large-board";
import { boardCards, createUser, defaultBoardId, deleteUser, signIn, testDb, waitForReorder } from "./helpers";

// DIG-93: the board on a phone.
test.use({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });

let user: Awaited<ReturnType<typeof createUser>>;
let boardId: string;

test.beforeEach(async ({ page }) => {
  user = await createUser();
  boardId = await defaultBoardId(user.id);
  await seedLargeBoard(testDb, user.id, boardId, 12);
  await signIn(page, user.email, user.password);
  await expect(boardCards(page)).toHaveCount(12);
});
test.afterEach(() => deleteUser(user.id));
test.afterAll(() => testDb.$disconnect());

const views = (page: Page) => page.getByRole("group", { name: "Board view" });
const strip = (page: Page) => page.getByRole("region", { name: "Photo strip" });
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

/** Visible controls smaller than 44 px either way. */
const small = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("a, button, [role=button], input, select")]
      .filter((el) => el.checkVisibility() && !el.closest("[hidden], nextjs-portal"))
      .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 1 && (r.width < 43.9 || r.height < 43.9))
      .map(({ name, r }) => `${name}: ${Math.round(r.width)}x${Math.round(r.height)}`)
  );

/** Once the photos have moved: until then, the animation covers the page. */
async function openStrip(page: Page) {
  await views(page).getByRole("button", { name: "Strip" }).tap();
  await expect(strip(page)).toBeVisible();
  await expect(page.locator("html[data-board-transition]")).toHaveCount(0);
}

async function longPress(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  await expect(page.locator("[data-lifted]")).toHaveCount(1);
  for (let i = 1; i <= 6; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 6, y: from.y + ((to.y - from.y) * i) / 6 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("the grid has two columns of 4:5 photos, 44 px targets, and nothing covers the last card", async ({ page }) => {
  const boxes = await boardCards(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x));
  expect(new Set(boxes.map(Math.round)).size).toBe(2);
  const photo = (await page.getByTestId("photo-cover").first().boundingBox())!;
  expect(photo.width / photo.height).toBeCloseTo(0.8, 1);
  expect(await small(page)).toEqual([]);
  await noSideways(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const last = (await boardCards(page).last().boundingBox())!;
  const actions = (await page.getByRole("group", { name: "Board actions" }).boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(actions.y);
  const nav = page.getByRole("navigation", { name: "Studio" });
  await expect(nav.getByRole("link", { name: "Boards" })).toHaveAttribute("aria-current", "page");
  expect(actions.y + actions.height).toBeLessThanOrEqual((await nav.boundingBox())!.y);
  await nav.getByRole("link", { name: "Account" }).tap();
  await expect(page).toHaveURL("/account");
  await noSideways(page);
});

test("Add photos opens the picker", async ({ page }) => {
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add photos" }).tap();
  expect((await picker).isMultiple()).toBe(true);
});

test("the ⋯ menu opens, fits, renames, and gives focus back", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.getByRole("button", { name: "More for p0001" }).tap();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: "Delete" })).toBeInViewport();
  expect(await small(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More for p0001" })).toBeFocused();

  await page.getByRole("button", { name: "More for p0001" }).tap();
  await sheet.getByRole("button", { name: "Rename" }).tap();
  expect(await small(page)).toEqual([]);
  await sheet.getByLabel("Photo name").fill("Harbor");
  await sheet.getByRole("button", { name: "Save name" }).tap();
  await expect(page.getByRole("button", { name: "More for Harbor" })).toBeVisible();
  await page.getByRole("button", { name: "More for Harbor" }).tap();
  await sheet.getByRole("button", { name: "Edit" }).tap();
  await expect(page.getByRole("dialog", { name: /Harbor/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("switches to Strip, swipes one photo at a time, and follows with the thumbnails", async ({ page }) => {
  await openStrip(page);
  await expect(strip(page)).toBeVisible();
  await expect(page.getByText("01 / 12")).toBeVisible();
  expect(await small(page)).toEqual([]);
  await noSideways(page);
  // The next photo peeks in.
  const next = (await boardCards(page).nth(1).boundingBox())!;
  expect(next.x).toBeLessThan(345);
  expect(next.x + next.width).toBeGreaterThan(360);
  // The photo's name is on screen without scrolling, clear of the navigation.
  const name = (await boardCards(page).first().getByText("p0000", { exact: true }).boundingBox())!;
  expect(name.y + name.height).toBeLessThan((await page.getByRole("navigation", { name: "Studio" }).boundingBox())!.y);
  const box = (await strip(page).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", { x: 200, y: Math.round(box.y + 60), xDistance: -180, speed: 900 });
  await expect(page.getByText("02 / 12")).toBeVisible();
  // The swipe has settled on the photo, not between two.
  await expect.poll(async () => Math.round((await boardCards(page).nth(1).boundingBox())!.x)).toBe(20);
  await page.getByRole("button", { name: /^Go to photo 6,/ }).tap();
  await expect(page.getByText("06 / 12")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Go to photo 6,/ })).toBeInViewport();
  await strip(page).focus();
  await page.keyboard.press("End");
  await expect(page.getByText("12 / 12")).toBeVisible();
  await views(page).getByRole("button", { name: "Grid" }).tap();
  await expect(page.getByRole("group", { name: "Board actions" })).toBeVisible();
});

test("long-press moves a photo in the grid", async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, 150));
  const from = (await boardCards(page).nth(0).boundingBox())!;
  const to = (await boardCards(page).nth(1).boundingBox())!;
  const saved = waitForReorder(page);
  await longPress(page, { x: from.x + 60, y: from.y + 100 }, { x: to.x + to.width - 20, y: to.y + 100 });
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(boardCards(page).nth(1)).toContainText("p0000");
});

test("a swipe on a card scrolls the page and moves nothing", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", { x: 100, y: 400, yDistance: -250, speed: 800 });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await expect(boardCards(page).nth(0)).toContainText("p0000");
});

test("long-press moves a photo in the strip, which scrolls along at its edge", async ({ page }) => {
  await openStrip(page);
  const box = (await boardCards(page).nth(0).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 60, y: box.y + 80 }] });
  await expect(page.locator("[data-lifted]")).toHaveCount(1);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 345, y: box.y + 80 }] });
  await expect.poll(() => strip(page).evaluate((el) => el.scrollLeft), { intervals: [50] }).toBeGreaterThan(600);
  const saved = waitForReorder(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect((await saved).ok()).toBe(true);
  await expect(boardCards(page).nth(0)).toContainText("p0001");
});

test("filters the board", async ({ page }) => {
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Not in a zine 12" }).tap();
  await expect(boardCards(page)).toHaveCount(12);
});
