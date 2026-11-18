// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminViewBanner, AdminViewToggle } from "./AdminViewToggle";

const reload = vi.fn();
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  reload.mockReset();
});

describe("AdminViewToggle", () => {
  it("is a switch that reflects the current view", () => {
    render(<AdminViewToggle viewingAsFree={false} reload={reload} />);
    expect(screen.getByRole("switch", { name: "View as Free user" })).toHaveAttribute("aria-checked", "false");
  });

  it("turns Free view on and reloads the page so every cached view is replaced", async () => {
    fetchMock.mockResolvedValue(Response.json({ viewAsFree: true }));
    const user = userEvent.setup();
    render(<AdminViewToggle viewingAsFree={false} reload={reload} />);
    await user.click(screen.getByRole("switch", { name: "View as Free user" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/view-as",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ viewAsFree: true }) })
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows an error and does not refresh when the switch fails", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Only admins can switch views." }, { status: 403 }));
    const user = userEvent.setup();
    render(<AdminViewToggle viewingAsFree={false} reload={reload} />);
    await user.click(screen.getByRole("switch", { name: "View as Free user" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only admins can switch views.");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("AdminViewBanner", () => {
  it("explains the Free view and switches back", async () => {
    fetchMock.mockResolvedValue(Response.json({ viewAsFree: false }));
    const user = userEvent.setup();
    render(<AdminViewBanner reload={reload} />);
    expect(screen.getByRole("status")).toHaveTextContent("You're viewing the studio as a Free user.");
    await user.click(screen.getByRole("button", { name: "Back to admin view" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/view-as",
      expect.objectContaining({ body: JSON.stringify({ viewAsFree: false }) })
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
