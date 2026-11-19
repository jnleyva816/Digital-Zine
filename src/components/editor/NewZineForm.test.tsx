// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewZineForm } from "./NewZineForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  push.mockReset();
});

const BOARDS = [
  { id: "home", name: "Home" },
  { id: "tokyo", name: "Tokyo" },
];

describe("NewZineForm (DIG-25)", () => {
  it("builds the new zine from the board I pick", async () => {
    fetchMock.mockResolvedValue(Response.json({ zine: { id: "z1" } }, { status: 201 }));
    render(<NewZineForm boards={BOARDS} limitReached={null} />);
    const select = screen.getByLabelText("Board");
    expect(select).toHaveValue("home");
    await userEvent.selectOptions(select, "Tokyo");
    await userEvent.type(screen.getByLabelText("Title"), "Tokyo Issue");
    await userEvent.click(screen.getByRole("button", { name: "Create zine" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/editor/z1"));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ title: "Tokyo Issue", boardId: "tokyo" });
  });

  it("starts on the board it is given, such as the one I came from", () => {
    render(<NewZineForm boards={BOARDS} initialBoardId="tokyo" limitReached={null} />);
    expect(screen.getByLabelText("Board")).toHaveValue("tokyo");
  });
});

describe("NewZineForm (DIG-32)", () => {
  it("replaces the form with an upgrade path when the zine limit is reached", () => {
    render(<NewZineForm boards={BOARDS} limitReached="Free includes 1 zine. Upgrade to Pro for unlimited zines." />);
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create zine" })).not.toBeInTheDocument();
    expect(screen.getByText("Free includes 1 zine. Upgrade to Pro for unlimited zines.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/billing");
  });

  it("shows the server's limit message if the limit is hit while the page was open", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: "Free includes 1 zine. Upgrade to Pro for unlimited zines.", code: "zine_limit" },
        { status: 403 }
      )
    );
    render(<NewZineForm boards={BOARDS} limitReached={null} />);
    await userEvent.type(screen.getByLabelText("Title"), "Second");
    await userEvent.click(screen.getByRole("button", { name: "Create zine" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Free includes 1 zine. Upgrade to Pro for unlimited zines.")
    );
    expect(push).not.toHaveBeenCalled();
  });
});
