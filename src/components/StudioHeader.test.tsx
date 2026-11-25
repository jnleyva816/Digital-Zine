// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("link", { name: "Boards" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Zines" })).toHaveAttribute("href", "/editor");
    expect(screen.getByRole("link", { name: "Recipes" })).not.toHaveAttribute("aria-current");
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
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    expect(screen.getByRole("link", { name: "Public Viewer" })).toHaveAttribute("href", "/z/a/b");
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/signin" });
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
