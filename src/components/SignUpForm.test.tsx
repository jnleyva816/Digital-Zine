// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpForm } from "./SignUpForm";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

const fetchMock = vi.fn();
beforeEach(() => {
  signIn.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

async function fill(overrides: Partial<Record<"name" | "email" | "password" | "confirm", string>> = {}, accept = true) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), overrides.name ?? "Ada Lovelace");
  await user.type(screen.getByLabelText("Email"), overrides.email ?? "ada@example.com");
  await user.type(screen.getByLabelText("Password"), overrides.password ?? "correct-horse-9");
  await user.type(screen.getByLabelText("Confirm password"), overrides.confirm ?? overrides.password ?? "correct-horse-9");
  if (accept) await user.click(screen.getByRole("checkbox", { name: /agree/i }));
  return user;
}
const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Create account" }));

describe("SignUpForm", () => {
  it("starts empty, with every control named and the terms linked", () => {
    render(<SignUpForm googleEnabled={false} />);
    for (const label of ["Name", "Email", "Password", "Confirm password"]) expect(screen.getByLabelText(label)).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /agree/i })).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/signin");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers Google only when it is set up", () => {
    const { rerender } = render(<SignUpForm googleEnabled={false} />);
    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
    rerender(<SignUpForm googleEnabled />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("starts Google sign-in, landing on the board", async () => {
    signIn.mockResolvedValue(undefined);
    render(<SignUpForm googleEnabled />);
    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/board" });
  });

  it.each([
    ["a mismatched confirmation", { confirm: "different-pass-1" }, true, /do not match/i],
    ["a short password", { password: "short1" }, true, /at least 8/i],
    ["a bad email", { email: "nope" }, true, /valid email/i],
    ["terms not accepted", {}, false, /accept the terms/i],
  ])("explains %s and sends nothing", async (_label, overrides, accept, message) => {
    render(<SignUpForm googleEnabled={false} />);
    await submit(await fill(overrides, accept));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the form, disables the button while it waits, and then asks the creator to check their email", async () => {
    let finish: (r: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    render(<SignUpForm googleEnabled={false} />);
    await submit(await fill());

    const button = await screen.findByRole("button", { name: /creating/i });
    expect(button).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/signup");
    expect(JSON.parse(init.body)).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "correct-horse-9",
      confirmPassword: "correct-horse-9",
      acceptTerms: true,
    });

    finish(json(201, { ok: true }));
    expect(await screen.findByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("points a taken email at sign-in", async () => {
    fetchMock.mockResolvedValue(json(409, { error: "An account with that email already exists. Sign in instead.", code: "email_taken" }));
    render(<SignUpForm googleEnabled={false} />);
    await submit(await fill());
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it.each([
    [429, "Too many accounts created from this network. Try again in 30 minutes."],
    [503, "Sign-up is not available yet: email is not set up on this server."],
  ])("shows the server's message for %s", async (status, error) => {
    fetchMock.mockResolvedValue(json(status, { error }));
    render(<SignUpForm googleEnabled={false} />);
    await submit(await fill());
    expect(await screen.findByRole("alert")).toHaveTextContent(error);
  });

  it("shows a connection error when the request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SignUpForm googleEnabled={false} />);
    await submit(await fill());
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("resends the link from the check-your-email screen", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { ok: true })).mockResolvedValueOnce(json(200, { ok: true }));
    render(<SignUpForm googleEnabled={false} />);
    await submit(await fill());
    await userEvent.click(await screen.findByRole("button", { name: /resend/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/signup/resend");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: "ada@example.com" });
    expect(await screen.findByRole("status")).toHaveTextContent(/sent/i);
  });
});
