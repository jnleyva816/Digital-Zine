// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Placement } from "@/lib/board/board-layout";
import { boardAsset, json } from "./board-test-utils";
import { VisionBoard } from "./VisionBoard";

// DIG-86, DIG-87, DIG-88: the board's bars, its views, the free-form canvas, and the tray.
const fetchMock = vi.fn();
const calls = (method: string, part: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).includes(part) && (init?.method ?? "GET") === method).map(([, init]) => JSON.parse(init.body as string));

function screenWidth(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width") ? wide : false, addEventListener() {}, removeEventListener() {} }));
}

const fog = boardAsset("fog");
const dune = boardAsset("dune");
const spot = (assetId: string, over: Partial<Placement> = {}): Placement => ({ assetId, x: 10, y: 20, width: 200, rotation: 0, z: 1, look: "print", tape: false, ...over });

function board(over: Partial<React.ComponentProps<typeof VisionBoard>> = {}) {
  return render(
    <VisionBoard boardId="b1" boardName="Autumn Roll" initialAssets={[fog, dune]} otherBoards={[]} otherBoardsBytes={0} usedIn={{}} initialTotal={2} initialPlacements={[spot("fog")]} {...over} />
  );
}

beforeEach(() => {
  history.replaceState(null, "", "/boards/b1");
  screenWidth(true);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    String(url).startsWith("/api/assets?") ? json({ assets: [fog, dune], nextCursor: null, total: 2, counts: { all: 2, unplaced: 1, recipes: 0 } }) : json({ ok: true })
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

const views = () => screen.getByRole("group", { name: "Board view" });
const placed = (name = /^fog.jpg, on the board, /) => screen.getByRole("button", { name });
const lastSaved = () => calls("PUT", "/layout").at(-1);

describe("the board bar", () => {
  it("names the board, counts its photos, and leads to a new zine from it", () => {
    board();
    expect(screen.getByRole("heading", { level: 1, name: "Autumn Roll" })).toBeInTheDocument();
    expect(screen.getByText("2 photos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Make a zine" })).toHaveAttribute("href", "/editor?board=b1");
  });

  it("renames the board in place", async () => {
    board();
    await userEvent.click(screen.getByRole("button", { name: "Rename board" }));
    const field = screen.getByRole("textbox", { name: "Board name" });
    await userEvent.clear(field);
    await userEvent.type(field, "Winter Roll{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "Winter Roll" })).toBeInTheDocument();
    expect(calls("PATCH", "/api/boards/b1")).toEqual([{ name: "Winter Roll" }]);
  });

  it("keeps the old name and says why when the rename fails", async () => {
    board();
    fetchMock.mockImplementation(async () => json({ error: "Board names can be up to 60 characters." }, 400));
    await userEvent.click(screen.getByRole("button", { name: "Rename board" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Board name" }), "x{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 60 characters");
  });
});

describe("choosing a view", () => {
  it("starts in free form on a wide screen, and in the grid on a narrow one, which has no free form", () => {
    const wide = board();
    expect(screen.getByRole("region", { name: "Free form board" })).toBeInTheDocument();
    wide.unmount();
    screenWidth(false);
    board();
    expect(within(views()).queryByRole("button", { name: "Free form" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Vision Board photos" })).toBeInTheDocument();
  });

  it("switches, says so, puts the view in the address, and remembers it for this screen size", async () => {
    board();
    await userEvent.click(within(views()).getByRole("button", { name: "Grid" }));
    expect(within(views()).getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("list", { name: "Vision Board photos" })).toBeInTheDocument();
    expect(location.search).toBe("?view=grid");
    expect(calls("PATCH", "/api/boards/b1")).toEqual([{ viewPrefs: { wide: "grid" } }]);
    expect(screen.getByText("Grid view")).toBeInTheDocument();
  });

  it("opens the remembered view, and a link's view over it", () => {
    const remembered = board({ viewPrefs: { wide: "grid" } });
    expect(screen.getByRole("list", { name: "Vision Board photos" })).toBeInTheDocument();
    remembered.unmount();
    history.replaceState(null, "", "/boards/b1?view=free");
    board({ viewPrefs: { wide: "grid" } });
    expect(screen.getByRole("region", { name: "Free form board" })).toBeInTheDocument();
  });

  it("opens the grid for a free-form link on a narrow screen", () => {
    screenWidth(false);
    history.replaceState(null, "", "/boards/b1?view=free");
    board();
    expect(screen.getByRole("list", { name: "Vision Board photos" })).toBeInTheDocument();
  });
});

describe("a photo on the free-form board", () => {
  it("is selected by focus, with a toolbar, and cleared with Escape", async () => {
    board();
    expect(screen.queryByRole("toolbar", { name: "Selected photo" })).not.toBeInTheDocument();
    act(() => placed().focus());
    const bar = screen.getByRole("toolbar", { name: "Selected photo" });
    for (const name of ["Edit", "Recipe", "Smaller", "Larger", "Tilt", "To front", "Take off board"]) expect(within(bar).getByRole("button", { name })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("toolbar", { name: "Selected photo" })).not.toBeInTheDocument();
  });

  it("moves with the arrow keys, further with Shift, and says so", async () => {
    board();
    act(() => placed().focus());
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(lastSaved().placements[0]).toMatchObject({ assetId: "fog", x: 18, y: 20 }));
    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
    await waitFor(() => expect(lastSaved().placements[0]).toMatchObject({ x: 18, y: -12 }));
    expect(screen.getByText(/fog\.jpg moved up/i)).toBeInTheDocument();
  });

  it("resizes with the brackets and the toolbar, tilts, and comes to the front", async () => {
    board({ initialPlacements: [spot("fog"), spot("dune", { z: 7 })] });
    act(() => placed().focus());
    await userEvent.keyboard("]");
    await waitFor(() => expect(lastSaved().placements[0].width).toBe(220));
    await userEvent.keyboard("[[");
    await waitFor(() => expect(lastSaved().placements[0].width).toBe(200));
    await userEvent.click(screen.getByRole("button", { name: "Tilt" }));
    await waitFor(() => expect(lastSaved().placements[0].rotation).toBe(3));
    await userEvent.click(screen.getByRole("button", { name: "To front" }));
    await waitFor(() => expect(lastSaved().placements[0].z).toBe(8));
  });

  it("can lose its border", async () => {
    board();
    act(() => placed().focus());
    await userEvent.click(screen.getByRole("button", { name: "Plain" }));
    await waitFor(() => expect(lastSaved().placements[0].look).toBe("plain"));
  });

  it("comes off the board with Delete, and stays in the tray", async () => {
    board();
    act(() => placed().focus());
    await userEvent.keyboard("{Delete}");
    expect(screen.queryByRole("button", { name: /^fog.jpg, on the board, / })).not.toBeInTheDocument();
    await waitFor(() => expect(lastSaved()).toEqual({ placements: [], removed: ["fog"] }));
    expect(within(screen.getByRole("complementary", { name: "Photos on this board" })).getByRole("button", { name: /fog\.jpg/ })).toBeInTheDocument();
  });

  it("opens the same edit and recipe dialogs as the grid", async () => {
    board();
    act(() => placed().focus());
    await userEvent.click(screen.getByRole("button", { name: "Recipe" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a photo that is placed but not on the loaded page", () => {
    board({ initialAssets: [dune], initialPlacements: [spot("fog")], placedAssets: [fog] });
    expect(placed()).toBeInTheDocument();
  });
});

describe("saving the layout", () => {
  it("keeps the local layout when a save fails, says so quietly, and retries", async () => {
    board();
    fetchMock.mockImplementation(async (url: string) => (String(url).includes("/layout") ? json({ error: "nope" }, 500) : json({ ok: true })));
    act(() => placed().focus());
    await userEvent.keyboard("{ArrowRight}");
    expect(await screen.findByText(/couldn't save layout/i)).toBeInTheDocument();
    fetchMock.mockImplementation(async () => json({ ok: true }));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText(/couldn't save layout/i)).not.toBeInTheDocument());
    expect(lastSaved().placements[0]).toMatchObject({ x: 18 });
  });

  it("sends one save at a time, and the newest position last", async () => {
    board();
    let finish: (r: Response) => void = () => undefined;
    fetchMock.mockImplementation((url: string) => (String(url).includes("/layout") ? new Promise<Response>((r) => (finish = r)) : Promise.resolve(json({ ok: true }))));
    act(() => placed().focus());
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(calls("PUT", "/layout")).toHaveLength(1);
    await act(async () => finish(json({ ok: true })));
    await waitFor(() => expect(calls("PUT", "/layout")).toHaveLength(2));
    expect(lastSaved().placements[0].x).toBe(34);
  });
});

describe("the board tools", () => {
  it("tidies everything into place in one save", async () => {
    board({ initialPlacements: [spot("fog", { rotation: 9 }), spot("dune", { rotation: -9, z: 2 })] });
    await userEvent.click(screen.getByRole("button", { name: "Tidy up" }));
    await waitFor(() => expect(lastSaved().placements).toHaveLength(2));
    for (const p of lastSaved().placements) expect(p.rotation).toBe(0);
  });

  it("zooms by steps between 25% and 200%", async () => {
    board();
    const zoom = () => Number(/\d+/.exec(screen.getByTestId("board-zoom").textContent!)![0]);
    for (let i = 0; i < 30; i++) await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(zoom()).toBe(200);
    for (let i = 0; i < 40; i++) await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(zoom()).toBe(25);
  });
});

describe("the tray", () => {
  const tray = () => screen.getByRole("complementary", { name: "Photos on this board" });

  it("lists every photo, marking the ones on the board", async () => {
    board();
    expect(await within(tray()).findByRole("button", { name: "fog.jpg, on the board" })).toBeInTheDocument();
    expect(within(tray()).getByRole("button", { name: "Place dune.jpg on the board" })).toBeInTheDocument();
  });

  it("places a photo in the middle of the view with Enter, as a tilted print, above the rest", async () => {
    board();
    const thumb = await within(tray()).findByRole("button", { name: "Place dune.jpg on the board" });
    act(() => thumb.focus());
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(lastSaved().placements[0]).toMatchObject({ assetId: "dune", look: "print", z: 2 }));
    expect(Math.abs(lastSaved().placements[0].rotation)).toBeLessThanOrEqual(5);
    expect(placed(/^dune.jpg, on the board, /)).toBeInTheDocument();
  });

  it("searches and filters on the server", async () => {
    board();
    await userEvent.type(within(tray()).getByRole("searchbox", { name: "Search photos" }), "fog");
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("q=fog"))).toBe(true));
    await userEvent.click(within(tray()).getByRole("button", { name: /^Not on board/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("show=unplaced"))).toBe(true));
  });

  it("collapses to give the board the full width", async () => {
    board();
    await userEvent.click(screen.getByRole("button", { name: "Hide photo tray" }));
    expect(screen.queryByRole("complementary", { name: "Photos on this board" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show photo tray" }));
    expect(tray()).toBeInTheDocument();
  });
});

describe("loading more in the grid", () => {
  it("watches the end of the list whenever the grid is drawn, not only at page load (DIG-29)", async () => {
    const watched: Element[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe(el: Element) {
          watched.push(el);
        }
        disconnect() {}
      }
    );
    board({ initialCursor: "dune", initialTotal: 120 });
    const before = watched.length;
    await userEvent.click(within(views()).getByRole("button", { name: "Grid" }));
    const list = screen.getByRole("list", { name: "Vision Board photos" });
    expect(watched.slice(before).some((el) => !list.contains(el) && Boolean(list.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  });
});

describe("when the tray is hidden or the layout is stale", () => {
  it("opens the file picker from Upload, with the tray hidden", async () => {
    const picked = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    board();
    await userEvent.click(screen.getByRole("button", { name: "Hide photo tray" }));
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(picked).toHaveBeenCalledTimes(1);
    picked.mockRestore();
  });

  it("takes the server's layout when a placed photo is gone, instead of failing forever", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return json({ error: "Not found" }, 404);
      if (String(url).endsWith("/layout")) return json({ placements: [spot("dune")], notes: [] });
      return json({ assets: [fog, dune], nextCursor: null, total: 2, counts: { all: 2, unplaced: 1, recipes: 0 } });
    });
    board();
    placed().focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(await screen.findByRole("button", { name: /^dune.jpg, on the board, / })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^fog.jpg, on the board, / })).not.toBeInTheDocument();
    expect(screen.queryByText(/Couldn't save layout/)).not.toBeInTheDocument();
    expect(calls("PUT", "/layout")).toHaveLength(1);
  });
});
