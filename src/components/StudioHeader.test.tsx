// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StudioHeader } from "./StudioHeader";

// DIG-86: the app bar.
const signOut = vi.fn();
let path = "/boards/b1";
vi.mock("next/navigation", () => ({ usePathname: () => path, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOut(...a) }));
const user = { email: "sam@example.com", name: "Sam Ortega", tier: "free" as const, role: "user" as const, viewingAsFree: false };
const menu = () => screen.getByRole("button", { name: "Account menu" });

describe("StudioHeader", () => {
  it("links Boards, Zines, and Recipes, and marks the current one", () => {
    path = "/boards/b1";
    render(<StudioHeader user={user} />);
    const bar = within(within(screen.getByRole("banner")).getByRole("navigation", { name: "Studio" }));
    expect(bar.getByRole("link", { name: "Boards" })).toHaveAttribute("aria-current", "page");
    expect(bar.getByRole("link", { name: "Zines" })).toHaveAttribute("href", "/editor");
    expect(bar.getByRole("link", { name: "Recipes" })).not.toHaveAttribute("aria-current");
  });

  it("has a bottom bar for small screens, with Account in it (DIG-93)", () => {
    path = "/billing";
    render(<StudioHeader user={user} />);
    const tabs = within(screen.getAllByRole("navigation", { name: "Studio" })[1]);
    expect(tabs.getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([["Boards", "/boards"], ["Zines", "/editor"], ["Recipes", "/recipes"], ["Account", "/account"]]);
    expect(tabs.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "Boards" })).not.toHaveAttribute("aria-current");
  });

  it("shows the plan, leading to billing", () => {
    render(<StudioHeader user={user} />);
    expect(screen.getByRole("link", { name: "Free plan" })).toHaveAttribute("href", "/billing");
  });

  it("opens the account menu, with everything that used to be in the bar", async () => {
    render(<StudioHeader user={user} publishedPath="/z/a/b" />);
    expect(menu()).toHaveTextContent("SO");
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    await userEvent.click(menu());
    expect(menu()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("href", "/billing");
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    expect(screen.getByRole("link", { name: "Public Viewer" })).toHaveAttribute("href", "/z/a/b");
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/signin" });
  });

  it("links an admin, and nobody else, to the admin panel; viewing as Free hides it (DIG-136)", async () => {
    const { rerender } = render(<StudioHeader user={{ ...user, role: "admin" }} />);
    await userEvent.click(menu());
    expect(screen.getByRole("link", { name: "Admin panel" })).toHaveAttribute("href", "/admin");
    rerender(<StudioHeader user={{ ...user, role: "admin", viewingAsFree: true }} />);
    expect(screen.queryByRole("link", { name: "Admin panel" })).not.toBeInTheDocument();
    rerender(<StudioHeader user={user} />);
    expect(screen.queryByRole("link", { name: "Admin panel" })).not.toBeInTheDocument();
  });

  it("closes with Escape, returning focus, and with a click elsewhere", async () => {
    render(<StudioHeader user={user} />);
    await userEvent.click(menu());
    await userEvent.keyboard("{Escape}");
    expect(menu()).toHaveAttribute("aria-expanded", "false");
    expect(menu()).toHaveFocus();
    await userEvent.click(menu());
    await userEvent.click(document.body);
    expect(menu()).toHaveAttribute("aria-expanded", "false");
  });
});
