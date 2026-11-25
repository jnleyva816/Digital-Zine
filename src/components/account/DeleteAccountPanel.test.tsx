// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteAccountPanel } from "./DeleteAccountPanel";

// DIG-108: the delete account section. It says exactly what goes, and asks for the email and a re-check.
const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOut(...args) }));
const fetchMock = vi.fn();
beforeEach(() => {
  signOut.mockReset();
  signOut.mockResolvedValue(undefined);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

const EMAIL = "ada@example.com";
const props = { email: EMAIL, hasPassword: true, recentSignIn: false, subscribed: false } as const;
const open = (user = userEvent.setup()) => user.click(screen.getByRole("button", { name: /delete my account/i }));

async function confirm(user: ReturnType<typeof userEvent.setup>, { email = EMAIL, password = "correct-horse-9" } = {}) {
  await user.type(screen.getByLabelText(/type your email address/i), email);
  if (password) await user.type(screen.getByLabelText("Your password"), password);
  await user.click(screen.getByRole("button", { name: "Permanently delete my account" }));
}

describe("DeleteAccountPanel", () => {
  it("says exactly what is deleted and that it cannot be undone, before asking for anything", () => {
    render(<DeleteAccountPanel {...props} />);
    expect(screen.getByRole("heading", { name: "Delete account" })).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const part of [/vision boards and photos/i, /every stored copy/i, /zines/i, /saved recipes/i, /sign-in/i]) expect(text).toMatch(part);
    expect(text).toMatch(/published zines stop working at once/i);
    expect(text).toMatch(/cannot be undone/i);
    expect(text).toMatch(/payment records.*stripe/i);
    expect(screen.queryByLabelText(/type your email address/i)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mentions the subscription only for someone who has one, and says it ends at once with no refund", () => {
    const { rerender } = render(<DeleteAccountPanel {...props} />);
    expect(document.body.textContent).not.toMatch(/subscription/i);
    rerender(<DeleteAccountPanel {...props} subscribed />);
    expect(document.body.textContent).toMatch(/pro subscription is cancelled immediately, with no refund/i);
    expect(document.body.textContent).toMatch(/saved payment details are removed from stripe/i);
  });

  it("asks for the email and the password, and will not send until both are filled in", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountPanel {...props} />);
    await open(user);
    const button = screen.getByRole("button", { name: "Permanently delete my account" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/type your email address/i), "ada@exampl");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/type your email address/i), "e.com");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Your password"), "x");
    expect(button).toBeEnabled();
  });

  it("matches the email without caring about case or spaces", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountPanel {...props} hasPassword={false} recentSignIn />);
    await open(user);
    await user.type(screen.getByLabelText(/type your email address/i), "  ADA@Example.com ");
    expect(screen.getByRole("button", { name: "Permanently delete my account" })).toBeEnabled();
  });

  it("posts the email and password, shows it is working, then signs out and says it is done", async () => {
    let finish: (r: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<DeleteAccountPanel {...props} subscribed />);
    await open(user);
    await confirm(user);

    expect(await screen.findByRole("button", { name: /deleting/i })).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/account/delete");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: EMAIL, password: "correct-horse-9" });

    finish(json(200, { ok: true }));
    expect(await screen.findByRole("status")).toHaveTextContent("Your account has been deleted.");
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(screen.getByRole("link", { name: /back to the home page/i })).toHaveAttribute("href", "/");
    expect(screen.queryByLabelText(/type your email address/i)).not.toBeInTheDocument();
  });

  it("sends no password for a Google account that signed in a moment ago, and shows no password field", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    const user = userEvent.setup();
    render(<DeleteAccountPanel {...props} hasPassword={false} recentSignIn />);
    await open(user);
    expect(screen.queryByLabelText("Your password")).not.toBeInTheDocument();
    await confirm(user, { password: "" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: EMAIL });
  });

  it("asks a Google account whose sign-in is old to sign in again first, and returns here afterwards", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountPanel {...props} hasPassword={false} recentSignIn={false} />);
    await open(user);
    expect(screen.getByText(/sign in again/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Permanently delete my account" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/signin?callbackUrl=%2Faccount" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [403, { error: "That password is not right.", code: "wrong_password" }, "That password is not right."],
    [403, { error: "Sign in again to confirm it is you.", code: "reauth_required" }, "Sign in again to confirm it is you."],
    [409, { error: "You are the only admin, so this account cannot be deleted.", code: "last_admin" }, "only admin"],
    [502, { error: "We could not remove all your files, so your account is still here. Try again.", code: "storage_failed" }, "Try again."],
    [429, { error: "Too many attempts. Try again in 40 minutes.", code: "rate_limited" }, "Try again in 40 minutes."],
  ])("shows the server's reason for a %s and keeps the form, so the creator can try again", async (status, body, shown) => {
    fetchMock.mockResolvedValue(json(status, body));
    const user = userEvent.setup();
    render(<DeleteAccountPanel {...props} />);
    await open(user);
    await confirm(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(shown);
    expect(screen.getByRole("button", { name: "Permanently delete my account" })).toBeEnabled();
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByText("Your account has been deleted.")).not.toBeInTheDocument();
  });

  it("shows a connection error when the request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<DeleteAccountPanel {...props} />);
    await open(user);
    await confirm(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("lets the creator back out", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountPanel {...props} />);
    await open(user);
    const form = screen.getByRole("form", { name: /confirm account deletion/i });
    await user.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/type your email address/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete my account/i })).toBeInTheDocument();
  });
});
