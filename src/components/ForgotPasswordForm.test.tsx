// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

// DIG-107: ask for a reset link. The page says the same thing whoever the address belongs to.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

async function ask(email = "ada@example.com") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send reset link" }));
}

describe("ForgotPasswordForm", () => {
  it("starts empty, with the email named and a way back to sign-in", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute("href", "/signin");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("posts the address, disables the button while it waits, and then gives the one answer", async () => {
    let finish: (r: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    render(<ForgotPasswordForm />);
    await ask("  Ada@Example.com ");

    const busy = await screen.findByRole("button", { name: /sending/i });
    expect(busy).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/password/forgot");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "Ada@Example.com" });

    finish(json(200, { ok: true }));
    expect(await screen.findByRole("status")).toHaveTextContent("If that address has an account, we sent a link.");
    expect(screen.getByRole("link", { name: /back to sign in/i })).toBeInTheDocument();
  });

  it("does not change what it says for any answer the server gives for a valid address", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    render(<ForgotPasswordForm />);
    await ask();
    expect(await screen.findByRole("status")).toHaveTextContent(/if that address has an account/i);
    expect(screen.queryByText(/not found|no account|unknown/i)).not.toBeInTheDocument();
  });

  it("shows the server's wait message when asked too often, and lets the creator try again later", async () => {
    fetchMock.mockResolvedValue(json(429, { error: "That email has been sent the link too many times. Try again in 30 minutes.", code: "rate_limited" }));
    render(<ForgotPasswordForm />);
    await ask();
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 30 minutes.");
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains a bad address and sends nothing", async () => {
    render(<ForgotPasswordForm />);
    await ask("nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });

  it("shows the server's message if it refuses the address", async () => {
    fetchMock.mockResolvedValue(json(400, { error: "Enter a valid email address." }));
    render(<ForgotPasswordForm />);
    await ask("a@b.co");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a connection error when the request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ForgotPasswordForm />);
    await ask();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });
});
