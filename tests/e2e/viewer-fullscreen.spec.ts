import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { publicZinePath } from "../../src/lib/zine/public-zine-path";
import { createUserWithPhotos, defaultBoardId, deleteUser, testDb } from "./helpers";

/** DIG-49: a reader opens any photo of a public zine full screen. */

test.afterAll(async () => {
  await testDb.$disconnect();
});

let cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup) await deleteUser(id);
  cleanup = [];
});

/** A published zine with three pages; page 1 is cropped square with a frame. */
async function arrangeZine() {
  const { user, assets } = await createUserWithPhotos();
  cleanup.push(user.id);
  await testDb.mediaAsset.update({
    where: { id: assets[0].id },
    data: { edit: { ratio: "1:1", zoom: 1, x: 0.5, y: 0.5, frame: "black", cardSize: "normal" } },
  });
  const slug = `full-${randomUUID().slice(0, 8)}`;
  await testDb.zine.create({
    data: {
      ownerId: user.id,
      boardId: await defaultBoardId(user.id),
      title: "Brine & Light",
      slug,
      published: true,
      publishedAt: new Date("2026-11-02T12:00:00Z"),
      pages: {
        create: [
          { pageNumber: 1, content: { assetId: assets[0].id, caption: "Persimmons over coals" }, flipEnabled: true },
          { pageNumber: 2, content: { assetId: assets[1].id, caption: "The cellar at dawn" }, flipEnabled: false },
          { pageNumber: 3, content: { assetId: assets[2].id, caption: "" }, flipEnabled: true },
        ],
      },
    },
  });
  return { slug, path: publicZinePath(user.publicId, slug) };
}

const expand = (page: Page, n: number) => page.getByRole("button", { name: `View page ${n} full screen` });
const viewer = (page: Page) => page.getByRole("dialog");
const stage = (page: Page) => viewer(page).getByTestId("lightbox-photo");

/**
 * While the photo grows to full screen, the browser's transition overlay covers the page and takes
 * pointer events for about 0.3 s. Wait until the photo itself can be touched.
 */
async function settled(page: Page) {
  const box = (await stage(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await expect
    .poll(() => page.evaluate(([px, py]) => Boolean(document.elementFromPoint(px, py)?.closest("[data-testid='lightbox-photo']")), [x, y]))
    .toBe(true);
  return { x, y, box };
}

test("opens a photo full screen with its crop and frame, and closes back to the page", async ({ page }) => {
  const { path } = await arrangeZine();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(path);

  await expand(page, 1).click();
  await expect(viewer(page)).toBeVisible();
  await expect(viewer(page)).toContainText("1 / 3");
  await expect(viewer(page)).toContainText("Persimmons over coals");
  await expect(stage(page).getByTestId("edited-photo")).toHaveAttribute("data-ratio", "1:1");
  await expect(stage(page).getByTestId("edited-photo")).toHaveAttribute("data-frame", "black");
  // Opening it did not flip the card behind.
  await expect(page.getByTestId("zine-flip-card-1")).toHaveAttribute("data-flipped", "false");

  await page.keyboard.press("Escape");
  await expect(viewer(page)).toBeHidden();
  await expect(expand(page, 1)).toBeFocused();
  expect(errors).toEqual([]);
});

test("fits the whole photo on a dark background, at any screen size", async ({ page }) => {
  const { path } = await arrangeZine();
  await page.goto(path);
  for (const size of [{ width: 360, height: 640 }, { width: 1280, height: 800 }, { width: 800, height: 400 }]) {
    await page.setViewportSize(size);
    await expand(page, 2).click();
    const photo = (await stage(page).getByTestId("edited-photo").boundingBox())!;
    expect(photo.x, `${size.width}x${size.height} left`).toBeGreaterThanOrEqual(0);
    expect(photo.y, "top").toBeGreaterThanOrEqual(0);
    expect(photo.x + photo.width, "right").toBeLessThanOrEqual(size.width);
    expect(photo.y + photo.height, "bottom").toBeLessThanOrEqual(size.height);
    expect(await viewer(page).evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    await page.keyboard.press("Escape");
  }
});

test("moves between photos with the buttons and the arrow keys, and shows where it is", async ({ page }) => {
  const { path } = await arrangeZine();
  await page.goto(path);
  await expand(page, 1).click();

  await expect(viewer(page).getByRole("button", { name: "Previous photo" })).toBeDisabled();
  await viewer(page).getByRole("button", { name: "Next photo" }).click();
  await expect(viewer(page)).toContainText("2 / 3");
  await expect(viewer(page)).toContainText("The cellar at dawn");
  await page.keyboard.press("ArrowRight");
  await expect(viewer(page)).toContainText("3 / 3");
  await expect(viewer(page).getByRole("button", { name: "Next photo" })).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer(page)).toContainText("2 / 3");

  // Closing lands on the page the reader ended on.
  await page.keyboard.press("Escape");
  await expect(expand(page, 2)).toBeFocused();
});

test("keeps the page in the address, so Back closes the view and a shared link opens it", async ({ page }) => {
  const { path } = await arrangeZine();
  await page.goto(path);
  await expand(page, 2).click();
  await expect(page).toHaveURL(new RegExp(`${path}#page-2$`));
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`#page-3$`));

  await page.goBack();
  await expect(viewer(page)).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${path}$`));

  // A shared link opens that photo, and closing it stays on the zine.
  await page.goto(`${path}#page-3`);
  await expect(viewer(page)).toContainText("3 / 3");
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: "Brine & Light" })).toBeVisible();
});

test("keeps focus inside the view while it is open", async ({ page }) => {
  const { path } = await arrangeZine();
  await page.goto(path);
  await expand(page, 1).click();
  await expect(viewer(page)).toBeVisible();
  // The page behind is inert: focus may reach the dialog's controls, or leave the page for the browser's own, but never page content.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const behindTheDialog = await page.evaluate(() => {
      const el = document.activeElement;
      return Boolean(el && el !== document.body && !el.closest("dialog[open]"));
    });
    expect(behindTheDialog, `Tab ${i + 1} reached page content behind the dialog`).toBe(false);
  }
});

test("swipes: left for next, right for previous, down to close", async ({ page }) => {
  const { path } = await arrangeZine();
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(path);
  await expand(page, 2).click();
  const { x: cx, y: cy } = await settled(page);
  const drag = async (dx: number, dy: number) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
    await page.mouse.up();
  };

  await drag(-160, 0);
  await expect(viewer(page)).toContainText("3 / 3");
  await drag(160, 0);
  await expect(viewer(page)).toContainText("2 / 3");
  await drag(0, 180);
  await expect(viewer(page)).toBeHidden();
});

test("double-tap zooms in and back out, and a zoomed photo pans instead of swiping", async ({ page }) => {
  const { path } = await arrangeZine();
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(path);
  await expand(page, 2).click();
  const { x, y } = await settled(page);

  await expect(stage(page)).toHaveAttribute("data-zoom", "1");
  await page.mouse.dblclick(x, y);
  await expect(stage(page)).toHaveAttribute("data-zoom", "2.5");

  // A drag while zoomed moves the photo; it does not change page.
  const before = await stage(page).evaluate((el) => (el as HTMLElement).style.transform);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 120, y - 40, { steps: 6 });
  await page.mouse.up();
  await expect(viewer(page)).toContainText("2 / 3");
  expect(await stage(page).evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(before);

  await page.mouse.dblclick(x, y);
  await expect(stage(page)).toHaveAttribute("data-zoom", "1");
});

test("the zoom button works without a touch screen", async ({ page }) => {
  const { path } = await arrangeZine();
  await page.goto(path);
  await expand(page, 1).click();
  await viewer(page).getByRole("button", { name: "Zoom in" }).click();
  await expect(stage(page)).toHaveAttribute("data-zoom", "2.5");
  await viewer(page).getByRole("button", { name: "Zoom out" }).click();
  await expect(stage(page)).toHaveAttribute("data-zoom", "1");
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 800, height: 700 } });

  test("pinching two fingers apart zooms in", async ({ page }) => {
    const { path } = await arrangeZine();
    await page.goto(path);
    await expand(page, 2).click();
    const { x: cx, y: cy } = await settled(page);

    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number; id: number }[]) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    await touch("touchStart", [{ x: cx - 40, y: cy, id: 0 }, { x: cx + 40, y: cy, id: 1 }]);
    for (let step = 1; step <= 8; step++) {
      const spread = 40 + step * 25;
      await touch("touchMove", [{ x: cx - spread, y: cy, id: 0 }, { x: cx + spread, y: cy, id: 1 }]);
    }
    await touch("touchEnd", []);

    await expect.poll(async () => Number(await stage(page).getAttribute("data-zoom"))).toBeGreaterThan(1.5);
    // Still on the same photo.
    await expect(viewer(page)).toContainText("2 / 3");
  });
});

test("the page still lists every photo and offers the view before any script runs", async ({ request }) => {
  const { path } = await arrangeZine();
  const html = await (await request.get(path)).text();
  expect(html).toContain("View page 1 full screen");
  expect(html).toContain("View page 3 full screen");
  expect(html).toContain('aria-label="Pages"');
});

test("opens without trouble when the reader prefers reduced motion", async ({ page }) => {
  const { path } = await arrangeZine();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await expand(page, 1).click();
  await expect(viewer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toBeHidden();
  expect(errors).toEqual([]);
});
