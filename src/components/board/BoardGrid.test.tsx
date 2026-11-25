// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_EDIT } from "@/lib/photo-edit";
import { boardAsset, json } from "./board-test-utils";
import { VisionBoard } from "./VisionBoard";

// DIG-90: the grid's three layouts, its cards, and changing the order.
const fetchMock = vi.fn();
const sent = (part: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(part)).map(([, init]) => JSON.parse(init.body as string));

const fog = boardAsset("fog", {
  kind: "recipe",
  recipe: { name: "Sunday Chrome", filmSimulation: "Classic Chrome" } as never,
  exif: { cameraMake: "FUJIFILM", cameraModel: "X-T5", iso: 400, aperture: "f/2" } as never,
});
const dune = boardAsset("dune");
const pine = boardAsset("pine");

function board(over: Partial<React.ComponentProps<typeof VisionBoard>> = {}) {
  return render(<VisionBoard boardId="b1" initialAssets={[fog, dune, pine]} otherBoards={[]} otherBoardsBytes={0} usedIn={{}} viewPrefs={{ narrow: "grid" }} {...over} />);
}

beforeEach(() => {
  history.replaceState(null, "", "/boards/b1");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const list = () => screen.getByRole("list", { name: "Vision Board photos" });
const cards = () => within(list()).getAllByRole("listitem");
const order = () => cards().map((c) => c.getAttribute("data-asset-id"));
const chips = () => screen.getByRole("group", { name: "Grid layout" });
const chip = (name: string) => within(chips()).getByRole("button", { name });
const handle = (name: string) => screen.getByRole("button", { name: new RegExp(`^Reorder ${name}.jpg`) });

describe("grid layouts", () => {
  it("starts in Masonry, each photo at its own shape", () => {
    board({ initialAssets: [boardAsset("wide", { edit: { ...DEFAULT_EDIT, ratio: "16:9", frame: "black" } })] });
    expect(chip("Masonry")).toHaveAttribute("aria-pressed", "true");
    expect(list()).toHaveAttribute("data-layout", "masonry");
    expect(screen.getByTestId("edited-photo")).toHaveAttribute("data-frame", "black");
    expect(screen.queryByTestId("photo-cover")).not.toBeInTheDocument();
  });

  it("opens the layout this board was left in", () => {
    board({ viewPrefs: { narrow: "grid", gridLayout: "even" } });
    expect(chip("Even")).toHaveAttribute("aria-pressed", "true");
    expect(list()).toHaveAttribute("data-layout", "even");
  });

  it("switches, says so, and remembers the choice for the board", async () => {
    board();
    await userEvent.click(chip("Feature"));
    expect(chip("Feature")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Masonry")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Feature layout")).toBeInTheDocument();
    expect(sent("/api/boards/b1")).toEqual([{ viewPrefs: { gridLayout: "feature" } }]);
  });

  it("draws every photo 4:5 in Even, without a frame the crop would cut", () => {
    board({ viewPrefs: { gridLayout: "even" }, initialAssets: [boardAsset("wide", { edit: { ...DEFAULT_EDIT, ratio: "16:9", frame: "black" } }), dune] });
    for (const cover of screen.getAllByTestId("photo-cover")) expect(cover.className).toContain("aspect-[4/5]");
    expect(screen.getAllByTestId("edited-photo")[0]).toHaveAttribute("data-frame", "none");
  });

  it("gives the first photo, and only it, two by two cells in Feature, whichever photo that is", async () => {
    board({ viewPrefs: { gridLayout: "feature" } });
    const big = () => cards().filter((c) => /\bcol-span-2\b/.test(c.className) && /\brow-span-2\b/.test(c.className)).map((c) => c.getAttribute("data-asset-id"));
    expect(big()).toEqual(["fog"]);
    await userEvent.click(screen.getByRole("button", { name: "Move fog.jpg later" }));
    expect(big()).toEqual(["dune"]);
  });

  it("says what the order is for", () => {
    board();
    expect(screen.getByText("Drag cards to change the order. The order is the zine's starting order.")).toBeInTheDocument();
  });

  it("has no layout chips on an empty board", () => {
    board({ initialAssets: [] });
    expect(screen.queryByRole("group", { name: "Grid layout" })).not.toBeInTheDocument();
  });
});

describe("a grid card", () => {
  it("shows its order number, name, and one line with the recipe and camera settings", () => {
    board();
    const card = within(cards()[0]);
    expect(card.getByText("01")).toBeInTheDocument();
    expect(card.getByText("fog.jpg")).toBeInTheDocument();
    expect(card.getByText("Sunday Chrome · Classic Chrome · ISO 400 · f/2 · FUJIFILM X-T5")).toBeInTheDocument();
  });

  it("keeps every photo action", () => {
    board({ otherBoards: [{ id: "b2", name: "Other" }] });
    for (const name of ["Move dune.jpg earlier", "Move dune.jpg later", "Edit dune.jpg", "Rename dune.jpg", "Move dune.jpg to another board", "Delete dune.jpg"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /^Add recipe ?for dune\.jpg$/ })).toBeInTheDocument();
  });
});

describe("reordering with the keyboard", () => {
  it("picks up with Space, moves with arrows, and saves once, on drop", async () => {
    board();
    act(() => handle("fog").focus());
    await userEvent.keyboard(" ");
    expect(handle("fog")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/^fog.jpg picked up, position 1 of 3\./)).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("fog.jpg, position 2 of 3.")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(order()).toEqual(["dune", "pine", "fog"]);
    expect(handle("fog")).toHaveFocus();
    expect(sent("/reorder")).toEqual([]);
    await userEvent.keyboard(" ");
    expect(handle("fog")).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(sent("/reorder")).toEqual([{ orderedIds: ["dune", "pine", "fog"] }]));
    expect(await screen.findByText("fog.jpg moved to position 3 of 3.")).toBeInTheDocument();
  });

  it("jumps to the ends with Home and End", async () => {
    board();
    act(() => handle("dune").focus());
    await userEvent.keyboard(" {End}");
    expect(order()).toEqual(["fog", "pine", "dune"]);
    await userEvent.keyboard("{Home}");
    expect(order()).toEqual(["dune", "fog", "pine"]);
  });

  it("puts the photo back with Escape, or when focus leaves, and saves nothing", async () => {
    board();
    act(() => handle("fog").focus());
    await userEvent.keyboard(" {ArrowRight}{Escape}");
    expect(order()).toEqual(["fog", "dune", "pine"]);
    expect(screen.getByText("Move cancelled. fog.jpg is back at position 1.")).toBeInTheDocument();
    await userEvent.keyboard(" {ArrowRight}{Tab}");
    expect(order()).toEqual(["fog", "dune", "pine"]);
    expect(sent("/reorder")).toEqual([]);
  });

  it("saves nothing when dropped where it was, and leaves arrows alone when nothing is held", async () => {
    board();
    act(() => handle("fog").focus());
    await userEvent.keyboard("{ArrowRight} {ArrowRight}{ArrowLeft} ");
    expect(order()).toEqual(["fog", "dune", "pine"]);
    expect(sent("/reorder")).toEqual([]);
  });

  it("puts the order back and says why when the save fails", async () => {
    fetchMock.mockImplementation(async () => json({ error: "Could not save the new order." }, 500));
    board();
    act(() => handle("fog").focus());
    await userEvent.keyboard(" {ArrowRight} ");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the new order.");
    expect(order()).toEqual(["fog", "dune", "pine"]);
  });
});

describe("reordering by drag", () => {
  const dataTransfer = { setData() {}, types: [], files: [], effectAllowed: "", dropEffect: "" };
  it.each(["masonry", "even", "feature"] as const)("drops a card after another in %s, and marks where it will land", async (gridLayout) => {
    board({ viewPrefs: { gridLayout } });
    const [first, , last] = cards();
    vi.spyOn(last, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
    fireEvent.dragStart(first, { dataTransfer });
    const over = new MouseEvent("dragover", { bubbles: true, cancelable: true, clientX: 90 });
    Object.assign(over, { dataTransfer });
    fireEvent(last, over);
    expect(within(last).getByTestId("drop-marker")).toHaveAttribute("data-side", "after");
    fireEvent.drop(list(), { dataTransfer });
    expect(order()).toEqual(["dune", "pine", "fog"]);
    expect(screen.queryByTestId("drop-marker")).not.toBeInTheDocument();
    await waitFor(() => expect(sent("/reorder")).toEqual([{ orderedIds: ["dune", "pine", "fog"] }]));
  });
});
