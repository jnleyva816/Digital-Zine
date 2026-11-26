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
  deactivated: false,
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
    // DIG-137 adds deactivate and delete to every other person; only the role change is withheld.
    expect(within(row("new@test.local")).queryByRole("button", { name: /an admin$/ })).not.toBeInTheDocument();
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

  it("offers deactivate and delete on people, nothing but the role on admins, and reactivate when deactivated (DIG-137)", () => {
    show([person("sam"), person("ada", { role: "admin" }), person("off", { deactivated: true })]);
    const names = (email: string) => within(row(email)).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names("sam@test.local")).toEqual(["Make sam@test.local an admin", "Deactivate sam@test.local", "Delete sam@test.local"]);
    expect(names("ada@test.local")).toEqual(["Remove admin role from ada@test.local"]);
    expect(names("off@test.local")).toEqual(["Reactivate off@test.local", "Delete off@test.local"]);
    expect(within(row("off@test.local")).getByText("Deactivated")).toBeInTheDocument();
  });

  it("deactivates, and says the subscription ends with the paid period", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "sam", deactivated: true, billing: "cancelling" }));
    show([person("sam")]);
    await userEvent.click(screen.getByRole("button", { name: "Deactivate sam@test.local" }));
    expect(screen.getByRole("form", { name: "Deactivate sam@test.local" })).toHaveTextContent("signed out everywhere");
    await userEvent.type(screen.getByLabelText("Your password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/sam/status", expect.objectContaining({ body: JSON.stringify({ action: "deactivate", password: "secret" }) }));
    expect(await screen.findByRole("status")).toHaveTextContent("sam@test.local is deactivated. Their subscription ends with the paid period.");
    expect(within(row("sam@test.local")).getByText("Deactivated")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Reactivate sam@test.local" })).toHaveFocus());
  });

  it("warns when the subscription could not be stopped", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "sam", deactivated: true, billing: "failed" }));
    show([person("sam")]);
    await userEvent.click(screen.getByRole("button", { name: "Deactivate sam@test.local" }));
    await userEvent.type(screen.getByLabelText("Your password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(await screen.findByRole("status")).toHaveTextContent("their subscription could not be stopped");
  });

  it("reactivates", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "off", deactivated: false }));
    show([person("off", { deactivated: true })]);
    await userEvent.click(screen.getByRole("button", { name: "Reactivate off@test.local" }));
    await userEvent.type(screen.getByLabelText("Your password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/off/status", expect.objectContaining({ body: JSON.stringify({ action: "reactivate", password: "secret" }) }));
    expect(await screen.findByRole("status")).toHaveTextContent("off@test.local can sign in again.");
    expect(within(row("off@test.local")).queryByText("Deactivated")).not.toBeInTheDocument();
  });

  it("deletes only once their email is typed, then drops them from the list", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "sam", deleted: true }));
    show([person("sam"), person("kim")]);
    await userEvent.click(screen.getByRole("button", { name: "Delete sam@test.local" }));
    expect(screen.getByRole("form", { name: "Delete sam@test.local" })).toHaveTextContent("cannot be undone");
    await userEvent.type(screen.getByLabelText("Your password"), "secret");
    const submit = screen.getByRole("button", { name: "Delete permanently" });
    await userEvent.type(screen.getByLabelText("Type their email address to confirm"), "kim@test.local");
    expect(submit).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Type their email address to confirm"));
    await userEvent.type(screen.getByLabelText("Type their email address to confirm"), "SAM@test.local");
    await userEvent.click(submit);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/sam/delete", expect.objectContaining({ body: JSON.stringify({ email: "SAM@test.local", password: "secret" }) }));
    expect(await screen.findByRole("status")).toHaveTextContent("sam@test.local was deleted.");
    expect(screen.queryByText("sam@test.local", { selector: "li *" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveFocus();
  });

  it("links to a person's zines when they have any (DIG-138)", () => {
    show([person("sam"), person("kim", { zineCount: 0 })]);
    expect(within(row("sam@test.local")).getByRole("link", { name: "2 zines" })).toHaveAttribute("href", "/admin/zines?owner=sam");
    expect(within(row("kim@test.local")).queryByRole("link")).not.toBeInTheDocument();
  });
});
