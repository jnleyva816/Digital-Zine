// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardAsset, json } from "./board-test-utils";
import { VisionBoard } from "./VisionBoard";

// DIG-93: the board on a phone.
const fetchMock = vi.fn();
const sent = (part: string) => fetchMock.mock.calls.filter(([url, init]) => String(url).includes(part) && init?.body).map(([, init]) => JSON.parse(init.body as string));
const recipe = { name: "Kodachrome 64", filmSimulation: "Classic Chrome" } as never;
const exif = { cameraMake: "FUJIFILM", cameraModel: "X-T5", aperture: "f/2.8", focalLength: "23mm", iso: 200, shutterSpeed: "1/60s", takenAt: "2026:10:21 08:00:00" };
const fog = boardAsset("fog", { kind: "recipe", recipe, exif });
const dune = boardAsset("dune", { exif });
const pine = boardAsset("pine");

function board(over: Partial<React.ComponentProps<typeof VisionBoard>> = {}) {
  return render(
    <VisionBoard boardId="b1" boardName="Autumn Roll" initialAssets={[fog, dune, pine]} otherBoards={[{ id: "b2", name: "Winter" }]} otherBoardsBytes={0} usedIn={{ dune: ["Issue 1"] }} initialTotal={3} {...over} />
  );
}
const cards = () => within(screen.getByRole("list", { name: "Vision Board photos" })).getAllByRole("listitem");
const order = () => cards().map((c) => c.dataset.assetId);
const more = (name: string) => screen.getByRole("button", { name: `More for ${name}.jpg` });
const sheet = () => screen.getByRole("dialog");
const show = () => screen.getByRole("group", { name: "Show" });

beforeEach(() => {
  history.replaceState(null, "", "/boards/b1");
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"), addEventListener() {}, removeEventListener() {} }));
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the phone grid", () => {
  it("shows the order, the name, and the recipe chip or the camera's settings", () => {
    board();
    expect(within(cards()[0]).getByText("01")).toBeInTheDocument();
    expect(within(cards()[0]).getByText("Kodachrome 64")).toBeInTheDocument();
    expect(within(cards()[1]).getByText(/X-T5 · f\/2.8/)).toBeInTheDocument();
    expect(within(cards()[2]).getByText("No camera details")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Grid layout" })).not.toBeInTheDocument();
  });

  it("filters, with counts of the whole board", async () => {
    board();
    expect(within(show()).getByRole("button", { name: "All 3" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(show()).getByRole("button", { name: "Recipes 1" }));
    expect(order()).toEqual(["fog"]);
    await userEvent.click(within(show()).getByRole("button", { name: "Not in a zine 2" }));
    expect(order()).toEqual(["fog", "pine"]);
    expect(within(cards()[1]).getByText("03")).toBeInTheDocument();
  });

  it("counts photos not loaded yet, and loads them when a filter needs them", async () => {
    const late = boardAsset("late", { kind: "recipe", recipe });
    fetchMock.mockImplementation(async () => json({ assets: [late], nextCursor: null, total: 4 }));
    board({ initialCursor: "pine", initialTotal: 4, filterCounts: { recipes: 2, unused: 3 } });
    await userEvent.click(within(show()).getByRole("button", { name: "Recipes 2" }));
    await waitFor(() => expect(order()).toEqual(["fog", "late"]));
    expect(within(show()).getByRole("button", { name: "Recipes 2" })).toBeInTheDocument();
  });

  it("says when a filter has nothing", async () => {
    board({ initialAssets: [dune], initialTotal: 1 });
    await userEvent.click(within(show()).getByRole("button", { name: "Recipes 0" }));
    expect(screen.getByText("No photos with a recipe on this board.")).toBeInTheDocument();
  });

  it("adds photos and makes a zine from the floating actions", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    board();
    const actions = screen.getByRole("group", { name: "Board actions" });
    await userEvent.click(within(actions).getByRole("button", { name: "Add photos" }));
    expect(click).toHaveBeenCalled();
    expect(within(actions).getByRole("link", { name: "Make a zine" })).toHaveAttribute("href", "/editor?board=b1");
    click.mockRestore();
  });
});

describe("the ⋯ menu", () => {
  it("offers the photo's actions, and closes with Escape", async () => {
    board();
    await userEvent.click(more("dune"));
    for (const name of ["Edit", "Add recipe", "Rename", "Move to board", "Move earlier", "Move later", "Delete"]) expect(within(sheet()).getByRole("button", { name })).toBeInTheDocument();
    fireEvent(sheet(), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves a photo one place", async () => {
    board();
    await userEvent.click(more("dune"));
    await userEvent.click(within(sheet()).getByRole("button", { name: "Move later" }));
    expect(order()).toEqual(["fog", "pine", "dune"]);
    await waitFor(() => expect(sent("/reorder")).toEqual([{ orderedIds: ["fog", "pine", "dune"] }]));
  });

  it("asks before deleting", async () => {
    board();
    await userEvent.click(more("dune"));
    await userEvent.click(within(sheet()).getByRole("button", { name: "Delete" }));
    expect(order()).toHaveLength(3);
    await userEvent.click(within(sheet()).getByRole("button", { name: "Delete photo" }));
    await waitFor(() => expect(order()).toEqual(["fog", "pine"]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows why a delete failed", async () => {
    fetchMock.mockImplementation(async () => json({ error: "In use." }, 409));
    board();
    await userEvent.click(more("dune"));
    await userEvent.click(within(sheet()).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(sheet()).getByRole("button", { name: "Delete photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("In use.");
    expect(order()).toHaveLength(3);
  });

  it("renames, and moves to another board", async () => {
    board();
    await userEvent.click(more("dune"));
    await userEvent.click(within(sheet()).getByRole("button", { name: "Rename" }));
    await userEvent.type(within(sheet()).getByLabelText("Photo name"), "Dunes{Enter}");
    expect(await screen.findByRole("button", { name: "More for Dunes" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More for Dunes" }));
    await userEvent.click(within(sheet()).getByRole("button", { name: "Move to board" }));
    expect(within(sheet()).getByText(/is used in “Issue 1”/)).toBeInTheDocument();
    await userEvent.click(within(sheet()).getByRole("button", { name: "Move photo" }));
    await waitFor(() => expect(order()).toEqual(["fog", "pine"]));
  });
});

describe("reordering by long press", () => {
  const handle = (n: number) => within(cards()[n]).getByRole("button", { name: /^Reorder/ });
  const touch = (el: Element, type: string, x: number, y: number) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    const points = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
    Object.assign(e, { touches: points });
    act(() => void el.dispatchEvent(e));
    return e;
  };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    document.elementFromPoint = () => cards()[2];
  });
  function dragTo(x: number) {
    const el = handle(0);
    vi.spyOn(cards()[2], "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
    touch(el, "touchstart", 10, 300);
    act(() => void vi.advanceTimersByTime(500));
    const move = touch(el, "touchmove", x, 320);
    touch(el, "touchend", 0, 0);
    return move;
  }

  it("drops the photo after the one under the finger, and keeps the page still", () => {
    board();
    expect(dragTo(90).defaultPrevented).toBe(true);
    expect(order()).toEqual(["dune", "pine", "fog"]);
    expect(sent("/reorder")).toEqual([{ orderedIds: ["dune", "pine", "fog"] }]);
  });

  it("is a scroll, not a move, when the finger moves first", () => {
    board();
    const el = handle(0);
    touch(el, "touchstart", 10, 300);
    expect(touch(el, "touchmove", 10, 340).defaultPrevented).toBe(false);
    act(() => void vi.advanceTimersByTime(500));
    touch(el, "touchmove", 90, 340);
    touch(el, "touchend", 0, 0);
    expect(order()).toEqual(["fog", "dune", "pine"]);
  });

  it("puts the photo back when the touch is cancelled", () => {
    board();
    const el = handle(0);
    touch(el, "touchstart", 10, 300);
    act(() => void vi.advanceTimersByTime(500));
    touch(el, "touchmove", 90, 320);
    touch(el, "touchcancel", 0, 0);
    expect(sent("/reorder")).toEqual([]);
    expect(screen.queryByTestId("drop-marker")).not.toBeInTheDocument();
  });
});

describe("the phone strip", () => {
  it("shows the date and place of the photo on screen, its caption, and a thumbnail for each", () => {
    board({ viewPrefs: { narrow: "strip" } });
    expect(screen.getByRole("region", { name: "Photo strip" })).toBeInTheDocument();
    expect(screen.getByText("Oct 21")).toBeInTheDocument();
    expect(screen.getByText("01 / 03")).toBeInTheDocument();
    expect(screen.getByText("Kodachrome 64")).toBeInTheDocument();
    expect(screen.getAllByText("X-T5 · 23mm · f/2.8 · 1/60s · ISO 200").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^Go to photo/ })).toHaveLength(3);
    expect(screen.queryByRole("group", { name: "Board actions" })).not.toBeInTheDocument();
  });

  it("moves a photo from the keyboard", async () => {
    board({ viewPrefs: { narrow: "strip" } });
    act(() => within(cards()[0]).getByRole("button", { name: /^Reorder/ }).focus());
    await userEvent.keyboard(" {ArrowRight} ");
    expect(order()).toEqual(["dune", "fog", "pine"]);
    await waitFor(() => expect(sent("/reorder")).toHaveLength(1));
  });
});
