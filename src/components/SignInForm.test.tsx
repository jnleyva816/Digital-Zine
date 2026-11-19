// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "./SignInForm";

const push = vi.fn();
const refresh = vi.fn();
let search = new URLSearchParams();
const signIn = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => search,
}));
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  signIn.mockReset();
  search = new URLSearchParams();
});

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Studio Email"));
  await user.type(screen.getByLabelText("Studio Email"), email);
  await user.clear(screen.getByLabelText("Password"));
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: /sign in to studio/i }));
}

describe("SignInForm", () => {
  it("hides and does not prefill the dev account when told not to", () => {
    render(<SignInForm showDevCredentials={false} />);
    expect(screen.getByLabelText("Studio Email")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.queryByText(/zine1234/)).not.toBeInTheDocument();
  });

  it("prefills and shows the dev account outside production", () => {
    render(<SignInForm showDevCredentials />);
    expect(screen.getByLabelText("Studio Email")).toHaveValue("creator@digitalzine.local");
    expect(screen.getByText(/creator@digitalzine\.local \/ zine1234/)).toBeInTheDocument();
  });

  it("shows an error and stays put when credentials are wrong", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin", ok: false });
    render(<SignInForm showDevCredentials={false} />);
    await submit("a@b.co", "nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("That email and password did not match an account.");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /sign in to studio/i })).toBeEnabled();
  });

  it("shows a connection error when the request throws", async () => {
    signIn.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SignInForm showDevCredentials={false} />);
    await submit("a@b.co", "pw");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
  });

  it("goes to a same-origin callbackUrl after signing in", async () => {
    search = new URLSearchParams({ callbackUrl: "/editor/z1" });
    signIn.mockResolvedValue({ ok: true, error: undefined });
    render(<SignInForm showDevCredentials={false} />);
    await submit("a@b.co", "pw");
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "a@b.co", password: "pw", redirect: false });
    expect(push).toHaveBeenCalledWith("/editor/z1");
  });

  it("ignores an off-site callbackUrl", async () => {
    search = new URLSearchParams({ callbackUrl: "https://evil.example" });
    signIn.mockResolvedValue({ ok: true, error: undefined });
    render(<SignInForm showDevCredentials={false} />);
    await submit("a@b.co", "pw");
    expect(push).toHaveBeenCalledWith("/board");
  });

  it("says to wait when there have been too many failed sign-ins (DIG-28)", async () => {
    signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin", code: "rate_limited", status: 200, url: null });
    render(<SignInForm showDevCredentials={false} />);
    await submit("a@b.co", "pw");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Too many sign-in attempts. Wait 15 minutes, then try again."
    );
    expect(push).not.toHaveBeenCalled();
  });
});
