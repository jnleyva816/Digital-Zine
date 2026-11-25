import { expect, test, type Locator, type Page } from "@playwright/test";
import { createUserWithPhotos, defaultBoardId, deleteUser, signIn, testDb } from "./helpers";

// DIG-86, DIG-87, DIG-88: the board's views, the free-form canvas, and the tray, with a real mouse.
let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

async function open(page: Page, view = "free") {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  await signIn(page, user.email, user.password);
  const boardId = await defaultBoardId(user.id);
  await page.goto(`/boards/${boardId}?view=${view}`);
  return { user, assets, boardId };
}
const canvas = (page: Page) => page.getByRole("region", { name: "Free form board" });
const tray = (page: Page) => page.getByRole("complementary", { name: "Photos on this board" });
const placed = (page: Page, name: string) => canvas(page).getByRole("button", { name: new RegExp(`^${name}, on the board, `) });
const centre = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}
const saved = (page: Page) => page.waitForResponse((r) => r.url().endsWith("/layout") && r.request().method() === "PUT" && r.ok());

async function placeFirst(page: Page) {
  const box = (await canvas(page).boundingBox())!;
  const thumb = tray(page).getByRole("button", { name: "Place persimmon.jpg on the board" });
  await expect(thumb).toBeVisible();
  const done = saved(page);
  await drag(page, await centre(thumb), { x: box.x + box.width / 2, y: box.y + box.height / 2 - 60 });
  await done;
  await expect(placed(page, "persimmon.jpg")).toBeVisible();
}

test("a photo is dragged from the tray, moved, and found where it was left after a reload", async ({ page }) => {
  const { assets } = await open(page);
  await placeFirst(page);
  await expect(tray(page).getByRole("button", { name: "persimmon.jpg, on the board" })).toBeVisible();

  const before = await testDb.boardPlacement.findUniqueOrThrow({ where: { assetId: assets[0].id } });
  const from = await centre(placed(page, "persimmon.jpg"));
  const done = saved(page);
  await drag(page, from, { x: from.x + 150, y: from.y - 40 });
  await done;
  const after = await testDb.boardPlacement.findUniqueOrThrow({ where: { assetId: assets[0].id } });
  expect(after.x - before.x).toBeCloseTo(150, 0);
  expect(after.y - before.y).toBeCloseTo(-40, 0);

  await page.reload();
  await expect(placed(page, "persimmon.jpg")).toBeVisible();
  const again = await testDb.boardPlacement.findUniqueOrThrow({ where: { assetId: assets[0].id } });
  expect([again.x, again.y, again.rotation]).toEqual([after.x, after.y, after.rotation]);
  // Free-form positions never change board order.
  const order = await testDb.mediaAsset.findMany({ where: { ownerId: assets[0].ownerId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  expect(order.map((o) => o.id)).toEqual(assets.map((a) => a.id));
});

test("dragging a photo back over the tray takes it off the board, and keeps it", async ({ page }) => {
  const { assets } = await open(page);
  await placeFirst(page);
  const done = saved(page);
  await drag(page, await centre(placed(page, "persimmon.jpg")), await centre(tray(page)));
  await done;
  await expect(placed(page, "persimmon.jpg")).toHaveCount(0);
  expect(await testDb.boardPlacement.count({ where: { assetId: assets[0].id } })).toBe(0);
  expect(await testDb.mediaAsset.count({ where: { id: assets[0].id } })).toBe(1);
});

test("a corner handle resizes, and the keyboard places and removes", async ({ page }) => {
  const { assets } = await open(page);
  await placeFirst(page);
  // Straight, so the corner is where the box says it is.
  await testDb.boardPlacement.update({ where: { assetId: assets[0].id }, data: { rotation: 0 } });
  await page.reload();
  await placed(page, "persimmon.jpg").click();
  const corner = canvas(page).locator('[data-corner="br"]');
  const at = await centre(corner);
  const done = saved(page);
  await drag(page, at, { x: at.x + 60, y: at.y + 75 });
  await done;
  expect((await testDb.boardPlacement.findUniqueOrThrow({ where: { assetId: assets[0].id } })).width).toBeCloseTo(260, 0);

  const second = tray(page).getByRole("button", { name: "Place cellar.jpg on the board" });
  await second.focus();
  const placedIt = saved(page);
  await page.keyboard.press("Enter");
  await placedIt;
  await placed(page, "cellar.jpg").focus();
  const removed = saved(page);
  await page.keyboard.press("Delete");
  await removed;
  await expect(placed(page, "cellar.jpg")).toHaveCount(0);

  await tray(page).getByRole("button", { name: /^Not on board/ }).click();
  await expect(tray(page).getByRole("button", { name: /^Place / })).toHaveCount(2);
  await expect(tray(page).getByRole("button", { name: /persimmon/ })).toHaveCount(0);
});

test("ctrl + wheel zooms around the pointer, the wheel pans, and neither scrolls the page", async ({ page }) => {
  await open(page);
  await placeFirst(page);
  const before = (await placed(page, "persimmon.jpg").boundingBox())!;
  await page.mouse.move(before.x + 5, before.y + 5);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -30);
  await page.keyboard.up("Control");
  await expect(page.getByTestId("board-zoom")).not.toHaveText("100%");
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await placed(page, "persimmon.jpg").boundingBox())!.y).toBeLessThan(before.y);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
});

test("the view is kept on reload and per screen size, and phones have no free form", async ({ page }) => {
  const { boardId } = await open(page);
  const views = page.getByRole("group", { name: "Board view" });
  const remembered = page.waitForResponse((r) => r.request().method() === "PATCH" && r.ok());
  await views.getByRole("button", { name: "Grid" }).click();
  await remembered;
  await expect(page).toHaveURL(/view=grid/);
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByRole("list", { name: "Vision Board photos" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/boards/${boardId}?view=free`);
  await expect(page.getByRole("list", { name: "Vision Board photos" })).toBeVisible();
  await expect(views.getByRole("button", { name: "Free form" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("the board fits a wide screen with no page scrolling, and trips no content security policy", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await open(page);
  await placeFirst(page);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThanOrEqual(0);
  expect(errors.filter((e) => /Content Security Policy/i.test(e))).toEqual([]);
});

// DIG-89
test("a sticky note is written, moved, and still there after a reload", async ({ page }) => {
  const { boardId } = await open(page);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.keyboard.type("night set: 3 to 7");
  const created = page.waitForResponse((r) => r.url().endsWith("/notes") && r.request().method() === "POST" && r.status() === 201);
  await page.keyboard.press("Escape");
  await created;
  const note = canvas(page).getByRole("button", { name: /^Note: night set: 3 to 7, / });
  const from = await centre(note);
  const before = await testDb.boardNote.findFirstOrThrow({ where: { boardId } });
  const moved = saved(page);
  await drag(page, from, { x: from.x + 120, y: from.y + 60 });
  await moved;
  await page.reload();
  await expect(note).toBeVisible();
  const after = await testDb.boardNote.findFirstOrThrow({ where: { boardId } });
  expect([after.x - before.x, after.y - before.y].map(Math.round)).toEqual([120, 60]);
  await expect(note).toHaveCSS("color", "rgb(61, 55, 48)");
  await expect(note).toHaveCSS("background-color", "rgb(246, 231, 168)");

  // Dropped on the tray, a note goes back; it is not deleted.
  await drag(page, await centre(note), await centre(tray(page)));
  await expect(note).toBeVisible();
  expect((await testDb.boardNote.findFirstOrThrow({ where: { boardId } })).x).toBe(after.x);
  await note.dblclick();
  await page.getByRole("textbox", { name: "Note text" }).fill("");
  const gone = page.waitForResponse((r) => r.request().method() === "DELETE" && r.ok());
  await page.keyboard.press("Escape");
  await gone;
  expect(await testDb.boardNote.count({ where: { boardId } })).toBe(0);
});

// DIG-140: Tailwind 4 moved `-translate-x-*` to its own CSS property, which adds to an inline transform.
test("a photo dragged from the tray stays under the pointer", async ({ page }) => {
  await open(page);
  const from = await centre(tray(page).getByRole("button", { name: "Place persimmon.jpg on the board" }));
  const at = { x: 700, y: 450 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y, { steps: 8 });
  const ghost = page.locator('[aria-hidden="true"].fixed:has(> img)');
  await expect.poll(async () => Math.abs((await centre(ghost)).x - at.x)).toBeLessThan(3);
  await expect.poll(async () => Math.abs((await centre(ghost)).y - at.y)).toBeLessThan(3);
  await page.mouse.up();
});
