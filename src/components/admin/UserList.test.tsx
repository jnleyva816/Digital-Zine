// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "@/lib/admin-users";
import { UserList } from "./UserList";

// DIG-136: the admin panel's user list.
const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOut(...a) }));
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  signOut.mockReset();
});

const person = (id: string, extra: Partial<AdminUser> = {}): AdminUser => ({
  id,
  name: `Name ${id}`,
  email: `${id}@test.local`,
  role: "user",
  tier: "free",
  verified: true,
  zineCount: 2,
  createdAt: "2026-11-01T12:00:00.000Z",
  ...extra,
});
const show = (users: AdminUser[], nextCursor: string | null = null, props = {}) =>
  render(<UserList initial={{ users, nextCursor }} adminId="me" hasPassword recentSignIn={false} {...props} />);
const row = (email: string) => screen.getByText(email).closest("li")!;

describe("UserList", () => {
  it("lists people, and offers no role change on yourself or on an unverified person", () => {
    show([person("me", { role: "admin" }), person("sam", { tier: "pro" }), person("new", { verified: false })]);
    expect(within(row("me@test.local")).getByText("You")).toBeInTheDocument();
    expect(within(row("me@test.local")).queryByRole("button")).not.toBeInTheDocument();
    expect(within(row("sam@test.local")).getByText("Pro")).toBeInTheDocument();
    expect(within(row("sam@test.local")).getByText(/2 zines/)).toBeInTheDocument();
    expect(within(row("new@test.local")).getByText("Email not verified")).toBeInTheDocument();
    expect(within(row("new@test.local")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("searches, and says when nobody matches", async () => {
    fetchMock.mockResolvedValue(Response.json({ users: [], nextCursor: null }));
    show([person("sam")]);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search by name or email" }), "a&b{Enter}");
    expect(await screen.findByText("No one matches “a&b”.")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/users?q=a%26b");
    expect(screen.queryByText("sam@test.local")).not.toBeInTheDocument();
  });

  it("shows that it is searching, then the server's error, and keeps the list", async () => {
    let answer!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((r) => (answer = r)));
    show([person("sam")]);
    await userEvent.type(screen.getByRole("searchbox"), "x{Enter}");
    expect(screen.getByRole("button", { name: "Searching…" })).toBeDisabled();
    answer(Response.json({ error: "You're searching too quickly." }, { status: 429 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You're searching too quickly.");
    expect(screen.getByText("sam@test.local")).toBeInTheDocument();
  });

  it("explains a lost connection", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    show([person("sam")]);
    await userEvent.type(screen.getByRole("searchbox"), "x{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");
  });

  it("loads more of the search on screen, and not of words typed since", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ users: [person("sam")], nextCursor: "c1" }));
    fetchMock.mockResolvedValueOnce(Response.json({ users: [person("sam"), person("kim")], nextCursor: null }));
    show([]);
    await userEvent.type(screen.getByRole("searchbox"), "m{Enter}");
    await screen.findByText("sam@test.local");
    await userEvent.type(screen.getByRole("searchbox"), "ore");
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("kim@test.local");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/users?q=m&cursor=c1");
    expect(screen.getAllByText("sam@test.local")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("makes someone an admin once the password is given", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "sam", role: "admin" }));
    show([person("sam")]);
    await userEvent.click(screen.getByRole("button", { name: "Make sam@test.local an admin" }));
    expect(screen.getByLabelText("Your password")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Make admin" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Your password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Make admin" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/sam/role", expect.objectContaining({ method: "POST", body: JSON.stringify({ role: "admin", password: "secret" }) }));
    expect(await screen.findByRole("status")).toHaveTextContent("sam@test.local is now an admin.");
    expect(screen.queryByLabelText("Your password")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove admin role from sam@test.local" })).toHaveFocus());
  });

  it("shows a refusal, keeps the role, and Cancel closes it", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "That password is not right.", code: "wrong_password" }, { status: 403 }));
    show([person("sam", { role: "admin" })]);
    await userEvent.click(screen.getByRole("button", { name: "Remove admin role from sam@test.local" }));
    await userEvent.type(screen.getByLabelText("Your password"), "bad");
    await userEvent.click(screen.getByRole("button", { name: "Remove admin role" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That password is not right.");
    expect(within(row("sam@test.local")).getByText("Admin")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Your password")).not.toBeInTheDocument();
  });

  it("asks an admin with no password to sign in again when the sign-in is old", async () => {
    show([person("sam")], null, { hasPassword: false });
    await userEvent.click(screen.getByRole("button", { name: "Make sam@test.local an admin" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/signin?callbackUrl=%2Fadmin" });
  });

  it("offers signing in again when the server says the sign-in has become old", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Sign in again.", code: "reauth_required" }, { status: 403 }));
    show([person("sam")], null, { hasPassword: false, recentSignIn: true });
    await userEvent.click(screen.getByRole("button", { name: "Make sam@test.local an admin" }));
    await userEvent.click(screen.getByRole("button", { name: "Make admin" }));
    expect(await screen.findByRole("button", { name: "Sign in again" })).toBeInTheDocument();
  });
});
