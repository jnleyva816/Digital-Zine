import { expect, test, type Page } from "@playwright/test";
import { seedLargeBoard } from "../../scripts/large-board";
import { createUser, defaultBoardId, deleteUser, signIn, testDb } from "./helpers";

// DIG-92: what only a browser can prove about moving between the board's views.
let user: Awaited<ReturnType<typeof createUser>>;
let errors: string[];

async function open(page: Page, view: string) {
  user = await createUser();
  const boardId = await defaultBoardId(user.id);
  await seedLargeBoard(testDb, user.id, boardId, 30);
  const photos = await testDb.mediaAsset.findMany({ where: { boardId }, orderBy: { sortOrder: "asc" } });
  for (const [i, p] of photos.slice(0, 3).entries()) {
    await testDb.boardPlacement.create({ data: { boardId, assetId: p.id, x: i * 260, y: 0, width: 200, rotation: i * 3, z: i + 1, look: "print", tape: false } });
  }
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1440, height: 900 });
  // Records what each switch animated, read while it runs.
  await page.addInitScript(() => {
    const w = window as unknown as { seen: { moved: string[]; ms: number[]; easing: string[] }[]; done: number };
    w.seen = [];
    w.done = 0;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((update: () => void) => {
      const t = start(update);
      void t.ready.then(() => {
        const groups = document.getAnimations().flatMap((a) => {
          const e = a.effect as KeyframeEffect;
          return e.pseudoElement?.startsWith("::view-transition") ? [{ name: e.pseudoElement, ms: Number(e.getTiming().duration), easing: getComputedStyle(document.documentElement, e.pseudoElement).animationTimingFunction }] : [];
        });
        w.seen.push({
          moved: groups.filter((g) => g.name.startsWith("::view-transition-group(board-photo-")).map((g) => g.name),
          ms: [...new Set(groups.map((g) => g.ms))],
          easing: [...new Set(groups.map((g) => g.easing))],
        });
      }, (e) => console.error("transition skipped", String(e)));
      void t.finished.then(() => w.done++);
      return t;
    }) as typeof document.startViewTransition;
  });
  await signIn(page, user.email, user.password);
  await page.goto(`/boards/${boardId}?view=${view}`);
}
test.afterEach(() => deleteUser(user.id));
test.afterAll(() => testDb.$disconnect());

const button = (page: Page, name: string) => page.getByRole("group", { name: "Board view" }).getByRole("button", { name });
const seen = (page: Page) => page.evaluate(() => (window as unknown as { seen: { moved: string[]; ms: number[]; easing: string[] }[] }).seen);
async function switchTo(page: Page, name: string) {
  const before = await page.evaluate(() => (window as unknown as { done: number }).done);
  await button(page, name).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { done: number }).done)).toBe(before + 1);
  await expect(button(page, name)).toBeFocused();
  return (await seen(page)).at(-1)!;
}

test("photos on both sides of a switch move, in 300 ms, and nothing is left behind", async ({ page }) => {
  await open(page, "free");
  await expect(page.getByRole("button", { name: /^p0000, on the board, 1 of 3/ })).toBeVisible();
  for (const name of ["Grid", "Strip", "Free form", "Strip", "Grid", "Free form"]) {
    const { moved, ms, easing } = await switchTo(page, name);
    expect(moved.length, name).toBeGreaterThanOrEqual(3);
    expect(ms).toEqual([300]);
    expect(easing).toEqual(["cubic-bezier(0, 0, 0.2, 1)"]);
  }
  expect(await page.evaluate(() => [document.documentElement.dataset.boardTransition ?? "", document.querySelectorAll('[style*="view-transition-name"]').length])).toEqual(["", 0]);
  expect(errors).toEqual([]);
});

test("reduced motion cross-fades the page, and Tidy up too", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "free");
  await expect(page.getByRole("button", { name: /^p0000, on the board, 1 of 3/ })).toBeVisible();
  await page.getByRole("button", { name: "Tidy up" }).click();
  await expect.poll(async () => (await seen(page)).length).toBe(1);
  expect((await seen(page))[0]).toMatchObject({ moved: [], ms: [150] });
  expect(await switchTo(page, "Grid")).toMatchObject({ moved: [], ms: [150] });
});

test("the focused photo stays in view through each view", async ({ page }) => {
  await open(page, "grid");
  const photo = page.getByRole("button", { name: /^Reorder p0020,/ });
  await photo.focus();
  await expect(photo).toBeInViewport();
  // The bar is above; bring it and the photo on screen together.
  await page.setViewportSize({ width: 1440, height: 2400 });
  await switchTo(page, "Strip");
  await expect(photo).toBeInViewport({ ratio: 0.9 });
  await page.setViewportSize({ width: 1440, height: 500 });
  await switchTo(page, "Grid");
  await expect(photo).toBeInViewport({ ratio: 0.5 });
});
