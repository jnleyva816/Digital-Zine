// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminZine } from "@/lib/admin/admin-zines";
import { AdminNav } from "./AdminNav";
import { ZineList } from "./ZineList";

// DIG-138: the admin panel's zines.
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const owner = { id: "u1", email: "sam@test.local" };
const dates = { createdAt: "2026-11-01T12:00:00.000Z", updatedAt: "2026-11-02T12:00:00.000Z" };
const priv = (id: string): AdminZine => ({ id, status: "private", owner, pageCount: 3, ...dates });
const pub = (id: string, extra: Partial<AdminZine> = {}): AdminZine =>
  ({ id, status: "public", title: `Title ${id}`, path: `/z/abc/${id}`, hidden: false, owner, pageCount: 1, ...dates, ...extra }) as AdminZine;
const show = (zines: AdminZine[], nextCursor: string | null = null, extra = {}) =>
  render(<ZineList initial={{ zines, nextCursor }} initialStatus="all" {...extra} />);
const items = () => within(screen.getByRole("list", { name: "Zines" })).getAllByRole("listitem");

describe("ZineList", () => {
  it("links a public zine, and shows a private one only as a private zine", () => {
    show([pub("a"), priv("b"), pub("c", { path: null, hidden: true })]);
    const [first, second, third] = items();
    expect(within(first).getByRole("link", { name: "Title a" })).toHaveAttribute("href", "/z/abc/a");
    expect(within(first).getByText(/1 page\b/)).toBeInTheDocument();
    expect(within(second).getByText("Private zine")).toBeInTheDocument();
    expect(within(second).queryByRole("link", { name: /Private/ })).not.toBeInTheDocument();
    expect(within(second).getByText(/3 pages/)).toBeInTheDocument();
    expect(within(second).getByText("sam@test.local")).toBeInTheDocument();
    expect(within(third).getByText("Title c")).toBeInTheDocument();
    expect(within(third).queryByRole("link", { name: "Title c" })).not.toBeInTheDocument();
    expect(within(third).getByText("Hidden: owner deactivated")).toBeInTheDocument();
  });

  it("filters by status, and says when there is nothing", async () => {
    fetchMock.mockResolvedValue(Response.json({ zines: [], nextCursor: null }));
    show([pub("a")]);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Private" }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/zines?status=private");
    expect(await screen.findByText("No private zines.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Private" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps to one person's zines, and can show everyone's again", async () => {
    fetchMock.mockResolvedValue(Response.json({ zines: [pub("z")], nextCursor: null }));
    show([priv("b")], "c1", { owner });
    expect(screen.getByText("Zines by sam@test.local")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/zines?status=all&owner=u1&cursor=c1");
    expect(items()).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Show everyone’s zines" })).toHaveAttribute("href", "/admin/zines");
  });

  it("shows an error and keeps the list", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "You're searching too quickly." }, { status: 429 }));
    show([pub("a")]);
    await userEvent.click(screen.getByRole("button", { name: "Public" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You're searching too quickly.");
    expect(items()).toHaveLength(1);
  });
});

describe("AdminNav", () => {
  it("links the panel's sections and marks the current one", () => {
    render(<AdminNav current="zines" />);
    const nav = within(screen.getByRole("navigation", { name: "Admin" }));
    expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin");
    expect(nav.getByRole("link", { name: "Zines" })).toHaveAttribute("aria-current", "page");
  });
});
