// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { boardAsset, json } from "./board-test-utils";
import { VisionBoard } from "./VisionBoard";

// DIG-92: the board's views with and without View Transitions.
const doc = document as unknown as { startViewTransition?: unknown };
const start = vi.fn((update: () => void) => {
  update();
  return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
});
let reduce = false;

beforeEach(() => {
  reduce = false;
  start.mockClear();
  history.replaceState(null, "", "/boards/b1");
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("min-width") || (reduce && q.includes("reduce")), addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("fetch", async (url: string) => (String(url).startsWith("/api/assets?") ? json({ assets: [], nextCursor: null, counts: { all: 0, unplaced: 0, recipes: 0 } }) : json({ ok: true })));
});
afterEach(() => {
  delete doc.startViewTransition;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});

const board = () =>
  render(
    <VisionBoard boardId="b1" initialAssets={[boardAsset("fog"), boardAsset("dune")]} otherBoards={[]} otherBoardsBytes={0} usedIn={{}} initialTotal={2} initialPlacements={[{ assetId: "fog", x: 10, y: 20, width: 200, rotation: 0, z: 1, look: "print", tape: false }]} />
  );
const view = (name: string) => within(screen.getByRole("group", { name: "Board view" })).getByRole("button", { name });

it("switches through every view with View Transitions unavailable", async () => {
  const errors = vi.spyOn(console, "error");
  board();
  for (const name of ["Grid", "Strip", "Free form"]) {
    await userEvent.click(view(name));
    expect(view(name)).toHaveAttribute("aria-pressed", "true");
    expect(view(name)).toHaveFocus();
  }
  expect(screen.getByRole("region", { name: "Free form board" })).toBeInTheDocument();
  expect(errors).not.toHaveBeenCalled();
});

it("has the new view drawn by the time the browser captures it, and animates only a real change", async () => {
  let drawn = false;
  doc.startViewTransition = start.mockImplementationOnce((update) => {
    update();
    drawn = screen.queryByRole("list", { name: "Vision Board photos" }) !== null;
    return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
  });
  board();
  await userEvent.click(view("Free form"));
  expect(start).not.toHaveBeenCalled();
  await userEvent.click(view("Grid"));
  expect(start).toHaveBeenCalledTimes(1);
  expect(drawn).toBe(true);
  expect(view("Grid")).toHaveFocus();
});

it("cross-fades Tidy up and Scatter for reduced motion, and moves the photos otherwise", async () => {
  doc.startViewTransition = start;
  board();
  await userEvent.click(screen.getByRole("button", { name: "Tidy up" }));
  expect(start).not.toHaveBeenCalled();
  expect(document.querySelector("[data-placed]")).toHaveClass("duration-300");
  reduce = true;
  await userEvent.click(screen.getByRole("button", { name: "Scatter" }));
  expect(start).toHaveBeenCalledTimes(1);
});

it("keeps Scatter moving when it is pressed again before the first move ends", () => {
  vi.useFakeTimers();
  try {
    board();
    const press = () => act(() => screen.getByRole("button", { name: "Scatter" }).click());
    press();
    act(() => vi.advanceTimersByTime(200));
    press();
    act(() => vi.advanceTimersByTime(200));
    expect(document.querySelector("[data-placed]")).toHaveClass("duration-300");
  } finally {
    vi.useRealTimers();
  }
});
