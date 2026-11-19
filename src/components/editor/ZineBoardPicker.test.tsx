// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZineBoardPicker } from "./ZineBoardPicker";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockReset();
});

const BOARDS = [
  { id: "home", name: "Home" },
  { id: "tokyo", name: "Tokyo" },
];

describe("ZineBoardPicker (DIG-25)", () => {
  it("switches an empty zine to another board and reloads its photos", async () => {
    fetchMock.mockResolvedValue(Response.json({ zine: { id: "z1" } }));
    render(<ZineBoardPicker zineId="z1" boardId="home" boards={BOARDS} canChange />);
    await userEvent.selectOptions(screen.getByLabelText("Board"), "Tokyo");
    await userEvent.click(screen.getByRole("button", { name: "Use this board" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/zines/z1", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ boardId: "tokyo" });
  });

  it("only names the board, with a link, once the zine has pages", () => {
    render(<ZineBoardPicker zineId="z1" boardId="tokyo" boards={BOARDS} canChange={false} />);
    expect(screen.queryByLabelText("Board")).not.toBeInTheDocument();
    expect(screen.getByText(/Built from/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tokyo" })).toHaveAttribute("href", "/boards/tokyo");
  });

  it("shows the server's reason when the switch is refused", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "A zine's board can only be changed while it has no pages." }, { status: 409 })
    );
    render(<ZineBoardPicker zineId="z1" boardId="home" boards={BOARDS} canChange />);
    await userEvent.selectOptions(screen.getByLabelText("Board"), "Tokyo");
    await userEvent.click(screen.getByRole("button", { name: "Use this board" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("A zine's board can only be changed while it has no pages.")
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
