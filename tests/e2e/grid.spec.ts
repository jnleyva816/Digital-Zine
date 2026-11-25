import { expect, test, type Page } from "@playwright/test";
import { seedLargeBoard } from "../../scripts/large-board";
import { boardCards, createUser, defaultBoardId, deleteUser, signIn, testDb, waitForReorder } from "./helpers";

// DIG-90: the grid's Masonry, Even, and Feature layouts.
let user: Awaited<ReturnType<typeof createUser>>;
let boardId: string;

test.beforeEach(async ({ page }) => {
  user = await createUser();
  boardId = await defaultBoardId(user.id);
  await seedLargeBoard(testDb, user.id, boardId, 12);
  const all = await testDb.mediaAsset.findMany({ where: { boardId }, orderBy: { sortOrder: "asc" } });
  // Three shapes, so Masonry has something to pack.
  for (const [i, a] of all.entries()) {
    const ratio = (["16:9", "4:5", "1:1"] as const)[i % 3];
    await testDb.mediaAsset.update({ where: { id: a.id }, data: { edit: { ratio, zoom: 1, x: 0.5, y: 0.5, frame: "none", cardSize: "normal" } } });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, user.email, user.password);
  await expect(boardCards(page)).toHaveCount(12);
});
test.afterEach(() => deleteUser(user.id));
test.afterAll(() => testDb.$disconnect());

const chips = (page: Page) => page.getByRole("group", { name: "Grid layout" });
const boxes = (page: Page) => boardCards(page).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
const columnCount = async (page: Page) => new Set((await boxes(page)).map((b) => Math.round(b.x))).size;
const handle = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^Reorder ${name},`) });
const names = (page: Page) => boardCards(page).locator("p:first-child").allInnerTexts();
async function pick(page: Page, name: string) {
  const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.ok());
  await chips(page).getByRole("button", { name }).click();
  await saved;
}
async function noOverlap(page: Page) {
  const all = await boxes(page);
  for (const [i, a] of all.entries()) for (const b of all.slice(i + 1)) {
    expect(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1).toBe(true);
  }
}

test("Masonry keeps each crop's shape in five columns, and two on a phone", async ({ page }) => {
  await expect.poll(() => columnCount(page)).toBe(5);
  const [wide, tall, square] = await boxes(page);
  expect(wide.h).toBeLessThan(square.h);
  expect(square.h).toBeLessThan(tall.h);
  await noOverlap(page);
  // Opening a panel makes one card taller, and the cards below move down to fit.
  await page.getByRole("button", { name: "Rename p0000" }).click();
  await expect(page.getByLabel("Photo name")).toBeVisible();
  await expect.poll(async () => (await boxes(page))[0].h).toBeGreaterThan(wide.h + 50);
  await noOverlap(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => columnCount(page)).toBe(2);
  await noOverlap(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("Even makes every card the same size; Feature makes the first two by two; the choice is remembered", async ({ page }) => {
  await pick(page, "Even");
  let all = await boxes(page);
  expect(await columnCount(page)).toBe(5);
  expect(new Set(all.map((b) => Math.round(b.h))).size).toBe(1);
  const photo = (await page.getByTestId("photo-cover").first().boundingBox())!;
  expect(photo.width / photo.height).toBeCloseTo(0.8, 1);
  // The photo covers its cell.
  const drawn = (await page.getByTestId("edited-photo").first().boundingBox())!;
  expect(drawn.width).toBeGreaterThanOrEqual(photo.width - 1);
  expect(drawn.height).toBeGreaterThanOrEqual(photo.height - 1);

  await pick(page, "Feature");
  await page.reload();
  await expect(chips(page).getByRole("button", { name: "Feature" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await boxes(page))[0]?.w ?? 0).toBeGreaterThan(500);
  all = await boxes(page);
  expect(all[0].w).toBeCloseTo(all[1].w * 2 + 16, 0);
  expect(all[0].h).toBeCloseTo(all[1].h * 2 + 16, 0);
  // Three columns of two cards stand beside it; the eighth photo starts the third row.
  expect(all[6].y).toBeLessThan(all[0].y + all[0].h);
  expect(all[7].y).toBeGreaterThan(all[0].y + all[0].h);
  await noOverlap(page);
});

for (const layout of ["Masonry", "Even", "Feature"]) {
  test(`drag changes the order in ${layout}`, async ({ page }) => {
    await pick(page, layout === "Masonry" ? "Even" : layout);
    if (layout === "Masonry") await pick(page, "Masonry");
    const from = (await boardCards(page).nth(0).boundingBox())!;
    const to = (await boardCards(page).nth(2).boundingBox())!;
    const saved = waitForReorder(page);
    await page.mouse.move(from.x + from.width / 2, from.y + 60);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width - 60, to.y + 60, { steps: 8 });
    await page.mouse.move(to.x + to.width - 30, to.y + 60, { steps: 4 });
    await page.mouse.up();
    expect((await saved).ok()).toBe(true);
    expect((await names(page)).slice(0, 4)).toEqual(["p0001", "p0002", "p0000", "p0003"]);
    await page.reload();
    await expect(boardCards(page).nth(2)).toContainText("p0000");
  });
}

test("the keyboard picks up, moves by row and column, keeps focus, drops, and cancels", async ({ page }) => {
  await pick(page, "Even");
  await handle(page, "p0000").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(boardCards(page).nth(6)).toContainText("p0000");
  await expect(handle(page, "p0000")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  const saved = waitForReorder(page);
  await page.keyboard.press("Space");
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(boardCards(page).nth(5)).toContainText("p0000");

  await handle(page, "p0000").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Home");
  await expect(boardCards(page).nth(0)).toContainText("p0000");
  await page.keyboard.press("Escape");
  await expect(boardCards(page).nth(5)).toContainText("p0000");
  await expect(handle(page, "p0000")).toBeFocused();
});

test("a thousand photos stay smooth in Masonry", async ({ page }) => {
  test.setTimeout(120_000);
  await testDb.mediaAsset.deleteMany({ where: { boardId } });
  await seedLargeBoard(testDb, user.id, boardId, 1000);
  await page.reload();
  for (let n = 120; n < 1060; n += 60) {
    await page.getByRole("button", { name: "Load more photos" }).scrollIntoViewIfNeeded();
    await expect.poll(() => boardCards(page).count()).toBeGreaterThanOrEqual(Math.min(n, 1000));
  }
  await expect(page.getByText(/^Showing /)).toHaveCount(0);
  await expect(boardCards(page)).toHaveCount(1000);
  // Placeholders keep their cards' height, so the page does not collapse as cards leave the screen.
  const heights = (await boxes(page)).map((b) => b.h);
  expect(Math.min(...heights)).toBeGreaterThan(150);
  expect(await page.getByRole("button", { name: /^Rename p/ }).count()).toBeLessThan(150);
  const frame = await page.evaluate(async () => {
    const times: number[] = [];
    let last = performance.now();
    window.scrollTo(0, 0);
    for (let i = 0; i < 120; i++) {
      window.scrollBy(0, 120);
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      times.push(now - last);
      last = now;
    }
    return times.sort((a, b) => a - b)[60];
  });
  console.log(`DIG-90: 1,000 photos in Masonry, median frame ${frame.toFixed(1)} ms`);
  expect(frame).toBeLessThan(50);
});
