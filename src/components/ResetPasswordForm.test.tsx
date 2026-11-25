// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "./ResetPasswordForm";

// DIG-107: choose a new password. Opening the page spends nothing; submitting does.
const push = vi.fn();
const refresh = vi.fn();
const signIn = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

const fetchMock = vi.fn();
beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  signIn.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

async function fill(password = "brand-new-pass-9", confirm = password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), confirm);
  await user.click(screen.getByRole("button", { name: "Set new password" }));
}

describe("ResetPasswordForm", () => {
  it("starts empty and sends nothing on its own", () => {
    render(<ResetPasswordForm token="tok" />);
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it.each([
    ["a short password", "short1", undefined, /at least 8/i],
    ["a confirmation that does not match", "brand-new-pass-9", "different-pass-1", /do not match/i],
  ])("explains %s and sends nothing", async (_label, password, confirm, message) => {
    render(<ResetPasswordForm token="tok" />);
    await fill(password, confirm);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the token and the passwords, then signs the creator in with the new password and opens their board", async () => {
    let finish: (r: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    signIn.mockResolvedValue({ error: undefined });
    render(<ResetPasswordForm token="tok_123" />);
    await fill();

    expect(await screen.findByRole("button", { name: /saving/i })).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/password/reset");
    expect(JSON.parse(init.body)).toEqual({ token: "tok_123", password: "brand-new-pass-9", confirmPassword: "brand-new-pass-9" });

    finish(json(200, { ok: true, email: "ada@example.com" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/board"));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "ada@example.com", password: "brand-new-pass-9", redirect: false });
    expect(refresh).toHaveBeenCalled();
  });

  it("sends the creator to sign-in with a clear message when the new password was saved but sign-in did not work", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, email: "ada@example.com" }));
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<ResetPasswordForm token="tok" />);
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(/password was changed/i);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/signin");
    expect(push).not.toHaveBeenCalled();
  });

  it("says a used, expired, or unknown link is expired, and offers a way to ask again", async () => {
    fetchMock.mockResolvedValue(json(400, { error: "This link is expired or already used. Ask for a new one.", code: "invalid_token" }));
    render(<ResetPasswordForm token="tok" />);
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("This link is expired or already used. Ask for a new one.");
    expect(screen.getByRole("link", { name: /ask for a new link/i })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("keeps the form when the server refuses the password, so the creator can fix it", async () => {
    fetchMock.mockResolvedValue(json(400, { error: "Do not use your email as your password.", code: "invalid_password" }));
    render(<ResetPasswordForm token="tok" />);
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("Do not use your email as your password.");
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set new password" })).toBeEnabled();
  });

  it("shows the wait message when too many attempts were made", async () => {
    fetchMock.mockResolvedValue(json(429, { error: "Too many attempts. Try again in 40 minutes.", code: "rate_limited" }));
    render(<ResetPasswordForm token="tok" />);
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 40 minutes.");
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("shows a connection error when the request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ResetPasswordForm token="tok" />);
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole("button", { name: "Set new password" })).toBeEnabled();
  });
});
