// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardAsset, json } from "./board-test-utils";
import { VisionBoard } from "./VisionBoard";

// DIG-91: the strip, a horizontal row grouped by day.
const fetchMock = vi.fn();
const scrollTo = vi.fn();
const sent = (part: string) => fetchMock.mock.calls.filter(([url, init]) => String(url).includes(part) && init?.body).map(([, init]) => JSON.parse(init.body as string));
const photo = (id: string, takenAt: string | null) => boardAsset(id, { exif: { takenAt, iso: 400 } as never });
const photos = [photo("fog", "2026:10:21 08:00:00"), photo("dune", "2026:10:21 09:00:00"), photo("pine", "2026:10:22 09:00:00"), photo("reef", null)];

function screenWidth(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width") ? wide : false, addEventListener() {}, removeEventListener() {} }));
}
function board(over: Partial<React.ComponentProps<typeof VisionBoard>> = {}) {
  return render(<VisionBoard boardId="b1" initialAssets={photos} otherBoards={[]} otherBoardsBytes={0} usedIn={{}} viewPrefs={{ wide: "strip", narrow: "strip" }} {...over} />);
}

beforeEach(() => {
  history.replaceState(null, "", "/boards/b1");
  screenWidth(true);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  scrollTo.mockReset();
  Element.prototype.scrollTo = scrollTo as never;
  // Room for about two photos.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(700);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});

const strip = () => screen.getByRole("region", { name: "Photo strip" });
const order = () => within(screen.getByRole("list", { name: "Vision Board photos" })).getAllByRole("listitem").map((c) => c.getAttribute("data-asset-id"));
const handle = (name: string) => screen.getByRole("button", { name: new RegExp(`^Reorder ${name}.jpg`) });
const lastLeft = () => (scrollTo.mock.calls.at(-1)?.[0] as ScrollToOptions | undefined)?.left;

describe("the strip view", () => {
  it("is chosen from the view switch, and remembered, on wide screens and narrow ones", async () => {
    const first = board({ viewPrefs: { wide: "grid" } });
    await userEvent.click(within(screen.getByRole("group", { name: "Board view" })).getByRole("button", { name: "Strip" }));
    expect(strip()).toBeInTheDocument();
    expect(screen.getByText("Strip view")).toBeInTheDocument();
    expect(location.search).toBe("?view=strip");
    expect(sent("/api/boards/b1")).toEqual([{ viewPrefs: { wide: "strip" } }]);
    first.unmount();
    history.replaceState(null, "", "/boards/b1");
    screenWidth(false);
    fetchMock.mockClear();
    board({ viewPrefs: {} });
    await userEvent.click(within(screen.getByRole("group", { name: "Board view" })).getByRole("button", { name: "Strip" }));
    expect(sent("/api/boards/b1")).toEqual([{ viewPrefs: { narrow: "strip" } }]);
  });

  it("opens from a link", () => {
    history.replaceState(null, "", "/boards/b1?view=strip");
    board({ viewPrefs: {} });
    expect(strip()).toBeInTheDocument();
  });

  it("shows every photo in board order, under the day it was taken", () => {
    board();
    expect(order()).toEqual(["fog", "dune", "pine", "reef"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Oct 21", "Oct 22", "No date"]);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getAllByText("ISO 400").length).toBeGreaterThan(0);
  });

  it("counts the photos in view, and marks them in the scrubber", () => {
    board();
    expect(screen.getByText("1–2 of 4")).toBeInTheDocument();
    const scrubber = within(screen.getByRole("group", { name: "All photos" }));
    expect(scrubber.getAllByRole("button").map((b) => b.getAttribute("aria-current"))).toEqual(["true", "true", null, null]);
  });

  it("jumps to a photo from the scrubber", async () => {
    board();
    await userEvent.click(screen.getByRole("button", { name: "Go to photo 3, pine.jpg" }));
    expect(lastLeft()).toBeGreaterThan(700);
  });

  it("moves one photo with the arrows, and to the ends with Home and End", async () => {
    board();
    act(() => strip().focus());
    await userEvent.keyboard("{ArrowRight}");
    const one = lastLeft()!;
    expect(one).toBe(368);
    await userEvent.keyboard("{End}");
    expect(lastLeft()).toBeGreaterThan(one);
    await userEvent.keyboard("{Home}");
    expect(lastLeft()).toBe(0);
    expect(sent("/reorder")).toEqual([]);
  });

  it("leaves the keys alone while a name is being typed", async () => {
    board();
    await userEvent.click(screen.getByRole("button", { name: "Rename fog.jpg" }));
    scrollTo.mockClear();
    await userEvent.type(screen.getByLabelText("Photo name"), "{Home}{ArrowRight}");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("reorders from the keyboard, as the grid does, and saves once", async () => {
    board();
    act(() => handle("fog").focus());
    await userEvent.keyboard(" {ArrowRight}{ArrowRight}");
    expect(order()).toEqual(["dune", "pine", "fog", "reef"]);
    expect(handle("fog")).toHaveFocus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(sent("/reorder")).toEqual([{ orderedIds: ["dune", "pine", "fog", "reef"] }]));
  });

  it("moves focus between photos with the arrows when nothing is held", async () => {
    board();
    act(() => handle("fog").focus());
    await userEvent.keyboard("{ArrowRight}");
    expect(handle("dune")).toHaveFocus();
    expect(order()).toEqual(["fog", "dune", "pine", "reef"]);
  });

  it("draws only the photos near the view, and still names the rest", () => {
    const many = Array.from({ length: 200 }, (_, i) => photo(`p${i}`, null));
    board({ initialAssets: many });
    expect(order()).toHaveLength(200);
    expect(screen.getAllByRole("button", { name: /^Reorder / }).length).toBeLessThan(15);
    expect(screen.getAllByRole("button", { name: /^Go to photo / }).length).toBeLessThan(80);
    expect(screen.getByText("p150.jpg")).toBeInTheDocument();
  });

  it("loads the rest of the board, so the scrubber shows all of it", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/assets?") ? json({ assets: [photo(String(url).includes("cursor=x") ? "kelp" : "wave", null)], nextCursor: String(url).includes("cursor=x") ? "y" : null, total: 6 }) : json({ ok: true })
    );
    board({ initialCursor: "x", initialTotal: 6 });
    await waitFor(() => expect(order()).toEqual(["fog", "dune", "pine", "reef", "kelp", "wave"]));
  });

  it("says so when the rest cannot be loaded, and tries again when asked", async () => {
    fetchMock.mockImplementation(async () => json({ error: "Could not load more photos." }, 500));
    board({ initialCursor: "x", initialTotal: 6 });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load more photos.");
    const tries = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(tries + 1));
  });

  it("invites the first photo onto an empty board", () => {
    board({ initialAssets: [] });
    expect(screen.getByRole("heading", { name: "Your board is empty" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Photo strip" })).not.toBeInTheDocument();
  });
});
