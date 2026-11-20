// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyEmailForm } from "./VerifyEmailForm";

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

describe("VerifyEmailForm", () => {
  it("does nothing until the creator confirms, so a mail scanner opening the link cannot spend it", () => {
    render(<VerifyEmailForm token="tok" />);
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Verify my email" })).toBeEnabled();
  });

  it("verifies, signs in, and opens the board", async () => {
    signIn.mockResolvedValue({ ok: true, error: undefined });
    render(<VerifyEmailForm token="tok" />);
    await userEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    expect(signIn).toHaveBeenCalledWith("email-verification", { token: "tok", redirect: false });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/board"));
    expect(refresh).toHaveBeenCalled();
  });

  it("says the link is no good and offers a new one", async () => {
    signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<VerifyEmailForm token="old" />);
    await userEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired or already used/i);
    expect(push).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send a new link/i }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/signup/resend");
    expect(await screen.findByRole("status")).toHaveTextContent(/check your email/i);
  });

  it("shows a connection error when the request throws", async () => {
    signIn.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<VerifyEmailForm token="tok" />);
    await userEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole("button", { name: "Verify my email" })).toBeEnabled();
  });
});
