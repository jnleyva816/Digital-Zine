import { expect, test } from "@playwright/test";
import { seedLargeBoard } from "../../scripts/large-board";
import { boardCards, createUser, defaultBoardId, deleteUser, signIn, testDb, waitForReorder } from "./helpers";

/** DIG-29: a 2,000-photo board loads a page at a time and only renders what is near the screen. */

test.afterAll(async () => {
  await testDb.$disconnect();
});

test("a 2,000-photo board opens fast, loads more on scroll, and reorders across pages", async ({ page }) => {
  test.setTimeout(120_000);
  const user = await createUser();
  try {
    const boardId = await defaultBoardId(user.id);
    await seedLargeBoard(testDb, user.id, boardId, 2000);
    await signIn(page, user.email, user.password);

    // First screen: one page of 60, timed from navigation to the first card.
    const started = Date.now();
    await page.goto(`/boards/${boardId}`);
    await expect(boardCards(page).first()).toContainText("p0000");
    const firstScreenMs = Date.now() - started;
    await expect(boardCards(page)).toHaveCount(60);
    await expect(page.getByText("Showing 60 of 2,000 photos.")).toBeVisible();

    // Scrolling to the end of the list loads the next page.
    const scrollStarted = Date.now();
    await page.getByRole("button", { name: "Load more photos" }).scrollIntoViewIfNeeded();
    await expect(boardCards(page)).toHaveCount(120);
    const nextPageMs = Date.now() - scrollStarted;
    await expect(page.getByText("Showing 120 of 2,000 photos.")).toBeVisible();

    // Cards far from the screen are not rendered. Scroll to the end of what is loaded: the first
    // card becomes an empty placeholder that still names its photo.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByRole("button", { name: "Rename p0000" })).toHaveCount(0);
    await expect(boardCards(page).first()).toContainText("p0000");
    const rendered = await page.getByRole("button", { name: /^Rename p\d+/ }).count();
    expect(rendered).toBeLessThan(await boardCards(page).count());

    // Scrolling back brings a card back.
    await boardCards(page).nth(60).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Move p0060 earlier" })).toBeVisible();

    // Move the first photo of the second page into the first page.
    const saved = waitForReorder(page);
    await page.getByRole("button", { name: "Move p0060 earlier" }).click();
    expect((await saved).ok()).toBe(true);
    const order = await testDb.mediaAsset.findMany({
      where: { boardId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { originalName: true },
      take: 62,
    });
    expect(order.slice(58, 62).map((a) => a.originalName)).toEqual(["p0058", "p0060", "p0059", "p0061"]);
    expect(await testDb.mediaAsset.count({ where: { boardId } })).toBe(2000);

    test.info().annotations.push(
      { type: "timing", description: `first screen of a 2,000-photo board: ${firstScreenMs} ms` },
      { type: "timing", description: `next page of 60 on scroll: ${nextPageMs} ms` }
    );
    console.log(`DIG-29 timings: first screen ${firstScreenMs} ms, next page ${nextPageMs} ms`);
  } finally {
    await deleteUser(user.id);
  }
});

test("the editor's photo picker loads a large board a page at a time", async ({ page }) => {
  const user = await createUser();
  try {
    const boardId = await defaultBoardId(user.id);
    await seedLargeBoard(testDb, user.id, boardId, 150);
    const zine = await testDb.zine.create({
      data: { ownerId: user.id, boardId, title: "Big", slug: `big-${user.id}` },
    });
    await signIn(page, user.email, user.password);
    await page.goto(`/editor/${zine.id}`);
    const picker = page.getByRole("region", { name: "Add pages from your board" });
    await expect(picker.getByRole("button", { name: /^Add p\d+/ })).toHaveCount(60);
    await expect(picker.getByText("Showing 60 of 150 photos on this board.")).toBeVisible();
    await picker.getByRole("button", { name: "Load more photos" }).click();
    await expect(picker.getByRole("button", { name: /^Add p\d+/ })).toHaveCount(120);
    await picker.getByRole("button", { name: "Add p0100" }).click();
    await expect(page.getByRole("list", { name: "Pages" }).getByRole("listitem")).toHaveCount(1);
  } finally {
    await deleteUser(user.id);
  }
});
