import { expect, test, type Page } from "@playwright/test";
import {
  BOARD_URL,
  boardCards,
  createUserWithPhotos,
  defaultBoardId,
  deleteUser,
  makePro,
  signIn,
  testDb,
} from "./helpers";

/** DIG-25: several Vision Boards per creator, each zine built from one. */

const boardRows = (page: Page) => page.getByRole("list", { name: "Boards" }).getByRole("listitem");

test.afterAll(async () => {
  await testDb.$disconnect();
});

test("a Pro creator creates, renames, reorders, and deletes boards, keeping the photos", async ({ page }) => {
  const { user } = await createUserWithPhotos();
  try {
    await makePro(user.id);
    await signIn(page, user.email, user.password);
    await page.getByRole("link", { name: "All boards" }).click();
    await expect(page).toHaveURL("/boards");
    await expect(boardRows(page)).toHaveCount(1);
    await expect(boardRows(page).first()).toContainText("My board");
    await expect(boardRows(page).first()).toContainText("3 photos · 0 zines");

    for (const name of ["Tokyo", "Kyoto"]) {
      await page.getByLabel("New board name").fill(name);
      await page.getByRole("button", { name: "Create board" }).click();
      await expect(page.getByRole("link", { name })).toBeVisible();
    }

    await page.getByRole("button", { name: "Rename Kyoto" }).click();
    await page.getByLabel("Board name", { exact: true }).fill("Osaka");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("link", { name: "Osaka" })).toBeVisible();

    const reordered = page.waitForResponse((r) => r.url().endsWith("/api/boards/reorder"));
    await page.getByRole("button", { name: "Move Osaka up" }).click();
    expect((await reordered).ok()).toBe(true);
    await page.reload();
    await expect(boardRows(page)).toHaveText([/My board/, /Osaka/, /Tokyo/]);

    await page.getByRole("button", { name: "Delete My board" }).click();
    await page.getByLabel("Move its 3 photos to").selectOption({ label: "Tokyo" });
    await page.getByRole("button", { name: "Delete board" }).click();
    await expect(boardRows(page)).toHaveCount(2);
    await page.reload();
    await expect(boardRows(page)).toHaveText([/Osaka/, /Tokyo.*3 photos · 0 zines/]);

    await page.getByRole("link", { name: "Tokyo" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Tokyo" })).toBeVisible();
    await expect(boardCards(page)).toHaveCount(3);
  } finally {
    await deleteUser(user.id);
  }
});

test("moving a photo says which zines use it, and the zine keeps the photo", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    await makePro(user.id);
    const tokyo = await testDb.board.create({ data: { ownerId: user.id, name: "Tokyo", sortOrder: 1 } });
    const zine = await testDb.zine.create({
      data: {
        ownerId: user.id,
        boardId: await defaultBoardId(user.id),
        title: "Harbor Notes",
        slug: `harbor-${user.id}`,
        pages: { create: [{ pageNumber: 1, content: { assetId: assets[0].id, caption: "" } }] },
      },
    });

    await signIn(page, user.email, user.password);
    await page.getByRole("button", { name: "Move persimmon.jpg to another board" }).click();
    const panel = page.getByRole("group", { name: "Move persimmon.jpg" });
    await expect(panel).toContainText("This photo is used in “Harbor Notes”.");
    await panel.getByLabel("Move to board").selectOption({ label: "Tokyo" });
    await panel.getByRole("button", { name: "Move photo" }).click();
    await expect(boardCards(page)).toHaveCount(2);
    await expect(boardCards(page).filter({ hasText: "persimmon.jpg" })).toHaveCount(0);
    await expect(page.getByText("persimmon.jpg moved to Tokyo.")).toBeAttached();

    await page.goto(`/boards/${tokyo.id}`);
    await expect(boardCards(page)).toHaveCount(1);
    await expect(boardCards(page).first()).toContainText("persimmon.jpg");

    // The zine's page still shows the photo in the editor.
    await page.goto(`/editor/${zine.id}`);
    const pages = page.getByRole("list", { name: "Pages" }).getByRole("listitem");
    await expect(pages).toHaveCount(1);
    await expect(pages.first().getByRole("img", { name: "persimmon.jpg" })).toBeVisible();
  } finally {
    await deleteUser(user.id);
  }
});

test("a new zine is built from the board I pick, and its board can change until it has pages", async ({ page }) => {
  const { user, assets } = await createUserWithPhotos();
  try {
    await makePro(user.id);
    const tokyo = await testDb.board.create({ data: { ownerId: user.id, name: "Tokyo", sortOrder: 1 } });
    await testDb.mediaAsset.update({ where: { id: assets[2].id }, data: { boardId: tokyo.id } });
    await testDb.board.create({ data: { ownerId: user.id, name: "Empty", sortOrder: 2 } });

    await signIn(page, user.email, user.password);
    await page.goto("/editor");
    await page.getByLabel("Board").selectOption({ label: "Tokyo" });
    await page.getByLabel("Title").fill("Tokyo Issue");
    await page.getByRole("button", { name: "Create zine" }).click();
    await expect(page).toHaveURL(/\/editor\/[a-z0-9]+$/);
    await expect(page.getByRole("list", { name: "Pages" }).getByRole("listitem")).toHaveCount(1);
    const addRegion = page.getByRole("region", { name: "Add pages from your board" });
    await expect(addRegion.getByRole("button")).toHaveCount(1);
    await expect(addRegion.getByRole("button", { name: "Add chili.jpg" })).toBeVisible();
    await expect(page.getByText(/Built from/)).toContainText("Tokyo");

    await page.goto("/editor");
    await page.getByLabel("Board").selectOption({ label: "Empty" });
    await page.getByLabel("Title").fill("Empty Issue");
    await page.getByRole("button", { name: "Create zine" }).click();
    await expect(page.getByText("No pages yet.")).toBeVisible();
    await expect(page.getByText("“Empty” has no photos yet.")).toBeVisible();

    await page.getByLabel("Board", { exact: true }).selectOption({ label: "My board" });
    await page.getByRole("button", { name: "Use this board" }).click();
    await expect(addRegion.getByRole("button")).toHaveCount(2);
    await expect(addRegion.getByRole("button", { name: "Add persimmon.jpg" })).toBeVisible();
  } finally {
    await deleteUser(user.id);
  }
});

test("a Free creator keeps one board and is offered Pro for more", async ({ page }) => {
  const { user } = await createUserWithPhotos();
  try {
    await signIn(page, user.email, user.password);
    await page.goto("/boards");
    await expect(boardRows(page)).toHaveCount(1);
    await expect(page.getByLabel("New board name")).toHaveCount(0);
    await expect(page.getByText("Free includes 1 board. Upgrade to Pro for unlimited boards.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/billing");
  } finally {
    await deleteUser(user.id);
  }
});

test("another creator's board is a 404", async ({ page }) => {
  const mine = await createUserWithPhotos();
  const theirs = await createUserWithPhotos();
  try {
    await signIn(page, mine.user.email, mine.user.password);
    await expect(page).toHaveURL(BOARD_URL);
    const res = await page.goto(`/boards/${await defaultBoardId(theirs.user.id)}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Board not found" })).toBeVisible();
  } finally {
    await deleteUser(mine.user.id);
    await deleteUser(theirs.user.id);
  }
});
