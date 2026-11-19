// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardSummary } from "@/lib/boards";
import { BoardList } from "./BoardList";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockReset();
});

const board = (id: string, name: string, photoCount = 0, zineCount = 0, sortOrder = 0): BoardSummary => ({
  id,
  name,
  sortOrder,
  photoCount,
  zineCount,
});

const rows = () => within(screen.getByRole("list", { name: "Boards" })).getAllByRole("listitem");
const lastBody = () => JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body ?? "null")) as unknown;

describe("BoardList (DIG-25)", () => {
  it("links each board to its page and says what is on it", () => {
    render(<BoardList boards={[board("a", "Home", 3, 1), board("b", "Tokyo", 1, 0, 1)]} limitReached={null} />);
    expect(rows()).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/boards/a");
    expect(screen.getByText("3 photos · 1 zine")).toBeInTheDocument();
    expect(screen.getByText("1 photo · 0 zines")).toBeInTheDocument();
  });

  it("creates a board and adds it to the end of the list", async () => {
    fetchMock.mockResolvedValue(Response.json({ board: board("n", "Kyoto", 0, 0, 1) }, { status: 201 }));
    render(<BoardList boards={[board("a", "Home")]} limitReached={null} />);
    await userEvent.type(screen.getByLabelText("New board name"), "Kyoto");
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledWith("/api/boards", expect.objectContaining({ method: "POST" }));
    expect(lastBody()).toEqual({ name: "Kyoto" });
    expect(screen.getByRole("link", { name: "Kyoto" })).toHaveAttribute("href", "/boards/n");
  });

  it("asks for a name before creating", async () => {
    render(<BoardList boards={[board("a", "Home")]} limitReached={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the board a name.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers Pro instead of the create form when the plan allows no more boards", () => {
    render(
      <BoardList boards={[board("a", "Home")]} limitReached="Free includes 1 board. Upgrade to Pro for unlimited boards." />
    );
    expect(screen.queryByLabelText("New board name")).not.toBeInTheDocument();
    expect(screen.getByText("Free includes 1 board. Upgrade to Pro for unlimited boards.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/billing");
  });

  it("renames a board", async () => {
    fetchMock.mockResolvedValue(Response.json({ board: { id: "a", name: "Japan", sortOrder: 0 } }));
    render(<BoardList boards={[board("a", "Home")]} limitReached={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename Home" }));
    const input = screen.getByLabelText("Board name");
    expect(input).toHaveValue("Home");
    await userEvent.clear(input);
    await userEvent.type(input, "Japan");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Japan" })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/a", expect.objectContaining({ method: "PATCH" }));
  });

  it("moves a board up and saves the new order", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    render(<BoardList boards={[board("a", "Home"), board("b", "Tokyo", 0, 0, 1)]} limitReached={null} />);
    expect(screen.getByRole("button", { name: "Move Home up" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move Tokyo up" }));
    await waitFor(() => expect(within(rows()[0]).getByRole("link")).toHaveTextContent("Tokyo"));
    expect(lastBody()).toEqual({ orderedIds: ["b", "a"] });
  });

  it("does not offer to delete the only board", () => {
    render(<BoardList boards={[board("a", "Home", 2)]} limitReached={null} />);
    expect(screen.queryByRole("button", { name: "Delete Home" })).not.toBeInTheDocument();
  });

  it("explains that a board with zines cannot be deleted yet", async () => {
    render(<BoardList boards={[board("a", "Home", 2, 1), board("b", "Tokyo", 0, 0, 1)]} limitReached={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete Home" }));
    expect(
      screen.getByText("1 zine is built from “Home”. Delete it or move it to another board before deleting this board.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete board" })).not.toBeInTheDocument();
  });

  it("moves a board's photos to the board I choose, then deletes it", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, movedPhotos: 3 }));
    render(
      <BoardList
        boards={[board("a", "Home", 3), board("b", "Tokyo", 0, 0, 1), board("c", "Kyoto", 0, 0, 2)]}
        limitReached={null}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete Home" }));
    await userEvent.selectOptions(screen.getByLabelText("Move its 3 photos to"), "Kyoto");
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/a", expect.objectContaining({ method: "DELETE" }));
    expect(lastBody()).toEqual({ moveToBoardId: "c" });
    expect(screen.getByText("3 photos · 0 zines")).toBeInTheDocument();
  });

  it("shows the server's reason when a delete is refused, and keeps the board", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "“Harbor” is built from this board. Delete that zine or move it to another board first." }, { status: 409 })
    );
    render(<BoardList boards={[board("a", "Home"), board("b", "Tokyo", 0, 0, 1)]} limitReached={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete Home" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("“Harbor” is built from this board."));
    expect(rows()).toHaveLength(2);
  });
});
