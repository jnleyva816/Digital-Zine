// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardAsset, json } from "./board-test-utils";
import { VisionBoard } from "./VisionBoard";

// DIG-89: sticky notes on the free-form board.
const fetchMock = vi.fn();
const calls = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method).map(([url, init]) => ({ url: String(url), body: init.body ? JSON.parse(init.body as string) : undefined }));
const notes = [{ id: "n1", text: "warm palette?", x: 300, y: 40, width: 200, rotation: 0, z: 2 }];
const fog = boardAsset("fog");
const answer = async (url: string, init?: RequestInit) => {
  if (url.startsWith("/api/assets?")) return json({ assets: [fog], nextCursor: null, total: 1, counts: { all: 1, unplaced: 0, recipes: 0 } });
  if (init?.method === "POST") return json({ note: { id: "server1" } }, 201);
  return json({ ok: true });
};
const board = (over: Partial<React.ComponentProps<typeof VisionBoard>> = {}) =>
  render(<VisionBoard boardId="b1" boardName="Roll" initialAssets={[fog]} otherBoards={[]} otherBoardsBytes={0} usedIn={{}} initialTotal={1} initialPlacements={[{ assetId: "fog", x: 0, y: 0, width: 200, rotation: 0, z: 1, look: "print", tape: false }]} initialNotes={notes} {...over} />);

beforeEach(() => {
  history.replaceState(null, "", "/boards/b1");
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("min-width"), addEventListener() {}, removeEventListener() {} }));
  fetchMock.mockReset();
  fetchMock.mockImplementation(answer);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const field = () => screen.getByRole("textbox", { name: "Note text" });
const note = (text = "warm palette?") => screen.getByRole("button", { name: new RegExp(`^Note: ${text.replace("?", "\\?")}, `) });
const add = () => userEvent.click(screen.getByRole("button", { name: "Note" }));

describe("sticky notes", () => {
  it("are added in edit mode, above the rest, and saved with Escape", async () => {
    board();
    await add();
    expect(field()).toHaveFocus();
    expect(calls("POST")).toEqual([]);
    await userEvent.type(field(), "night set{Escape}");
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    expect(calls("POST")[0]).toMatchObject({ url: "/api/boards/b1/notes", body: { text: "night set", z: 3, width: 200 } });
    expect(Math.abs(calls("POST")[0].body.rotation)).toBeLessThanOrEqual(3);
    expect(note("night set")).toHaveFocus();
  });

  it("are saved by clicking away", async () => {
    board();
    await add();
    await userEvent.type(field(), "hello");
    await userEvent.click(screen.getByRole("region", { name: "Free form board" }));
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    expect(note("hello")).toBeInTheDocument();
  });

  it("are never saved empty: a new one just goes", async () => {
    board();
    await add();
    await userEvent.type(field(), "   {Escape}");
    expect(screen.queryByRole("textbox", { name: "Note text" })).not.toBeInTheDocument();
    expect(calls("POST")).toEqual([]);
    expect(screen.getByText("Empty note removed.")).toBeInTheDocument();
  });

  it("are deleted when emptied", async () => {
    board();
    act(() => note().focus());
    await userEvent.keyboard("{Enter}");
    await userEvent.clear(field());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(calls("DELETE")).toEqual([{ url: "/api/boards/b1/notes/n1", body: undefined }]));
    expect(screen.queryByRole("button", { name: /^Note: / })).not.toBeInTheDocument();
  });

  it("are edited with Enter or a double-click, up to 280 characters, and unchanged text is not saved", async () => {
    board();
    act(() => note().focus());
    await userEvent.keyboard("{Enter}");
    expect(field()).toHaveValue("warm palette?");
    expect(field()).toHaveAttribute("maxlength", "280");
    await userEvent.keyboard("{Escape}");
    expect(calls("PATCH")).toEqual([]);
    await userEvent.dblClick(note());
    await userEvent.type(field(), " yes{Escape}");
    await waitFor(() => expect(calls("PATCH")).toEqual([{ url: "/api/boards/b1/notes/n1", body: { text: "warm palette? yes" } }]));
  });

  it("move, resize, tilt, and stack like photos, saved with the layout", async () => {
    board();
    act(() => note().focus());
    const last = () => calls("PUT").at(-1)!.body;
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(last()).toEqual({ placements: [], removed: [], notes: [{ id: "n1", x: 308, y: 40, width: 200, rotation: 0, z: 2 }] }));
    const bar = within(screen.getByRole("toolbar", { name: "Selected note" }));
    await userEvent.click(bar.getByRole("button", { name: "Larger" }));
    await waitFor(() => expect(last().notes[0].width).toBe(220));
    await userEvent.click(bar.getByRole("button", { name: "Tilt" }));
    await waitFor(() => expect(last().notes[0].rotation).toBe(3));
    await userEvent.click(bar.getByRole("button", { name: "To front" }));
    await waitFor(() => expect(last().notes[0].z).toBe(3));
    expect(bar.queryByRole("button", { name: "Recipe" })).not.toBeInTheDocument();
  });

  it("are tidied with the photos, in one save", async () => {
    board();
    await userEvent.click(screen.getByRole("button", { name: "Tidy up" }));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    expect(calls("PUT")[0].body.placements).toHaveLength(1);
    expect(calls("PUT")[0].body.notes).toHaveLength(1);
  });

  it("are deleted with Delete, and from the toolbar", async () => {
    board({ initialNotes: [...notes, { ...notes[0], id: "n2", text: "two" }] });
    act(() => note().focus());
    await userEvent.keyboard("{Delete}");
    act(() => note("two").focus());
    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await waitFor(() => expect(calls("DELETE").map((c) => c.url)).toEqual(["/api/boards/b1/notes/n1", "/api/boards/b1/notes/n2"]));
  });

  it("wait to be created before they are moved or deleted, and use the saved id", async () => {
    board();
    let created: (r: Response) => void = () => undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "POST" ? new Promise<Response>((r) => (created = r)) : answer(url, init)));
    await add();
    await userEvent.type(field(), "quick{Escape}");
    await userEvent.keyboard("{ArrowRight}");
    expect(calls("PUT")).toEqual([]);
    await act(async () => created(json({ note: { id: "server1" } }, 201)));
    await waitFor(() => expect(calls("PUT").at(-1)!.body.notes[0].id).toBe("server1"));
    await userEvent.keyboard("{Delete}");
    await waitFor(() => expect(calls("DELETE").at(-1)!.url).toBe("/api/boards/b1/notes/server1"));
  });

  it("keep their text when saving fails, say why, do not hold up the layout, and retry", async () => {
    board();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => (init?.method === "POST" ? json({ error: "A board can hold 200 notes." }, 409) : answer(url, init)));
    await add();
    await userEvent.type(field(), "kept{Escape}");
    expect(await screen.findByText(/A board can hold 200 notes/)).toBeInTheDocument();
    expect(note("kept")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: /^fog.jpg, on the board, / }).focus());
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
    fetchMock.mockImplementation(answer);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText(/200 notes/)).not.toBeInTheDocument());
    expect(calls("POST").at(-1)!.body.text).toBe("kept");
  });

  it("keep what was being typed when the view changes", async () => {
    board();
    await add();
    await userEvent.type(field(), "half a thought");
    await userEvent.click(screen.getByRole("button", { name: "Grid" }));
    await waitFor(() => expect(calls("POST")[0]?.body.text).toBe("half a thought"));
    await userEvent.click(screen.getByRole("button", { name: "Free form" }));
    expect(note("half a thought")).toBeInTheDocument();
  });

  it("go when they were deleted elsewhere, saying so", async () => {
    board();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return json({ error: "Note not found" }, 404);
      if (url.endsWith("/layout") && !init?.method) return json({ placements: [], notes: [] });
      return answer(url, init);
    });
    await userEvent.dblClick(note());
    await userEvent.type(field(), " yes{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Note: / })).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("changed somewhere else");
  });
});
