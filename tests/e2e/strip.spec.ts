import { expect, test, type Page } from "@playwright/test";
import { seedLargeBoard } from "../../scripts/large-board";
import { boardCards, createUser, defaultBoardId, deleteUser, signIn, testDb, waitForReorder } from "./helpers";

// DIG-91: what the strip can only prove in a browser: scrolling, dragging, and a large board.
let user: Awaited<ReturnType<typeof createUser>>;
let boardId: string;

async function open(page: Page, count: number) {
  user = await createUser();
  boardId = await defaultBoardId(user.id);
  await seedLargeBoard(testDb, user.id, boardId, count);
  await testDb.mediaAsset.updateMany({ where: { boardId, originalName: { in: ["p0000", "p0001"] } }, data: { exif: { takenAt: "2026:10:21 08:00:00" } } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, user.email, user.password);
  await page.goto(`/boards/${boardId}?view=strip`);
  await expect(strip(page)).toBeVisible();
}
test.afterEach(() => deleteUser(user.id));
test.afterAll(() => testDb.$disconnect());

const strip = (page: Page) => page.getByRole("region", { name: "Photo strip" });
const left = (page: Page) => strip(page).evaluate((el) => el.scrollLeft);

test("keys, the wheel, and the scrubber move along the row, and the page itself never scrolls", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await open(page, 12);
  await expect(page.getByRole("heading", { name: "Oct 21" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No date" })).toBeVisible();
  await expect(page.getByText(/^1–\d of 12$/)).toBeVisible();
  const photo = (await boardCards(page).first().getByTestId("edited-photo").boundingBox())!;
  expect(photo.height).toBeCloseTo(440, 0);
  expect(photo.width).toBeCloseTo(352, 0);

  await strip(page).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/^3–\d of 12$/)).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByText(/–12 of 12$/)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText(/–12 of 12$/)).toHaveCount(0);
  await page.keyboard.press("Home");
  await expect.poll(() => left(page)).toBe(0);

  await page.getByRole("button", { name: /^Go to photo 6,/ }).click();
  await expect(page.getByText(/^6–\d of 12$/)).toBeVisible();

  const box = (await strip(page).boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 200);
  const before = await left(page);
  await page.mouse.wheel(600, 0);
  await expect.poll(() => left(page)).toBeGreaterThan(before + 200);
  expect(await page.evaluate(() => [document.documentElement.scrollWidth - document.documentElement.clientWidth, document.documentElement.scrollHeight - document.documentElement.clientHeight])).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test("drag changes the order", async ({ page }) => {
  await open(page, 6);
  const from = (await boardCards(page).nth(0).boundingBox())!;
  const to = (await boardCards(page).nth(2).boundingBox())!;
  const saved = waitForReorder(page);
  await page.mouse.move(from.x + 150, from.y + 120);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width - 60, to.y + 120, { steps: 8 });
  await page.mouse.move(to.x + to.width - 40, to.y + 120, { steps: 4 });
  await page.mouse.up();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(boardCards(page).nth(2)).toContainText("p0000");
});

test("a held photo stays focused and on screen across days, and drops where it is", async ({ page }) => {
  await open(page, 12);
  const handle = page.getByRole("button", { name: /^Reorder p0000,/ });
  await handle.focus();
  await page.keyboard.press("Space");
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  await expect(handle).toBeFocused();
  await expect(handle).toBeInViewport();
  const saved = waitForReorder(page);
  await page.keyboard.press("Space");
  expect((await saved).ok()).toBe(true);
  await expect(boardCards(page).nth(7)).toContainText("p0000");
});

test("a thousand photos load, draw only what is near, and scroll smoothly", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 1000);
  await expect(boardCards(page)).toHaveCount(1000, { timeout: 60_000 });
  await strip(page).focus();
  await page.keyboard.press("End");
  await expect(page.getByText(/–1,?000 of 1,000$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Go to photo 1000,/ })).toBeInViewport();
  expect(await page.getByRole("button", { name: /^Reorder p/ }).count()).toBeLessThan(20);
  const frame = await strip(page).evaluate(async (el) => {
    const times: number[] = [];
    let last = performance.now();
    el.scrollLeft = 0;
    for (let i = 0; i < 120; i++) {
      el.scrollLeft += 120;
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      times.push(now - last);
      last = now;
    }
    return times.sort((a, b) => a - b)[60];
  });
  console.log(`DIG-91: 1,000 photos in the strip, median frame ${frame.toFixed(1)} ms`);
  expect(frame).toBeLessThan(50);
});
