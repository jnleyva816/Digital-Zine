// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingPanel, type BillingPanelProps } from "./BillingPanel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn<typeof fetch>();
const navigate = vi.fn<(url: string) => void>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
  navigate.mockReset();
  refresh.mockReset();
});

function setup(props: Partial<BillingPanelProps> = {}) {
  render(
    <BillingPanel plan="Free" paymentFailed={false} configured taxExclusive={false} checkout={null} navigate={navigate} {...props} />
  );
  return userEvent.setup();
}

describe("BillingPanel", () => {
  it("shows the Free plan and the Pro offer", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Your plan: Free" })).toBeInTheDocument();
    expect(screen.getByText("$15/month")).toBeInTheDocument();
    expect(screen.getByText("Export your published zines as PDFs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage subscription" })).not.toBeInTheDocument();
  });

  it("says tax is added on top when automatic tax is on", () => {
    setup({ taxExclusive: true });
    expect(screen.getByText("$15/month plus applicable tax")).toBeInTheDocument();
  });

  it("sends Free creators to Stripe Checkout", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("button", { name: "Opening checkout…" })).toBeDisabled();

    await act(async () => resolve(Response.json({ configured: true, url: "https://checkout.stripe.test/s" })));
    expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.test/s");
  });

  it("shows checkout errors and re-enables the button", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Checkout could not start. Try again in a moment." }, { status: 502 }));
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Checkout could not start. Try again in a moment.");
    expect(screen.getByRole("button", { name: "Upgrade to Pro" })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("explains a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server. Check your connection and try again.");
  });

  it("says when billing is not configured and disables the buttons", () => {
    setup({ configured: false });
    expect(screen.getByText(/Billing is not set up in this environment/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade to Pro" })).toBeDisabled();
  });

  it("lets Pro creators open the Customer Portal", async () => {
    fetchMock.mockResolvedValue(Response.json({ configured: true, url: "https://billing.stripe.test/p" }));
    const user = setup({ plan: "Pro" });
    expect(screen.getByRole("heading", { name: "Your plan: Pro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upgrade to Pro" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manage subscription" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/portal", expect.objectContaining({ method: "POST" }));
    expect(navigate).toHaveBeenCalledWith("https://billing.stripe.test/p");
  });

  it("tells admins they have full access, with no billing buttons", () => {
    setup({ plan: "Admin" });
    expect(screen.getByRole("heading", { name: "Your plan: Admin" })).toBeInTheDocument();
    expect(screen.getByText(/Full access to every feature/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upgrade to Pro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage subscription" })).not.toBeInTheDocument();
  });

  it("shows admins previewing as Free the Free page, with checkout disabled", () => {
    setup({ plan: "Free", previewOnly: true });
    expect(screen.getByRole("heading", { name: "Your plan: Free" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade to Pro" })).toBeDisabled();
    expect(screen.getByText("Preview only: admin accounts can't subscribe.")).toBeInTheDocument();
  });

  it("warns Pro creators whose renewal failed", () => {
    setup({ plan: "Pro", paymentFailed: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Your last payment failed. Update your card to keep Pro.");
  });

  it("confirms a cancelled checkout", () => {
    setup({ checkout: "cancelled" });
    expect(screen.getByRole("status")).toHaveTextContent("Checkout was cancelled. You have not been charged.");
  });

  it("welcomes a new Pro subscriber", () => {
    setup({ plan: "Pro", checkout: "success" });
    expect(screen.getByRole("status")).toHaveTextContent("Welcome to Pro. PDF export is now unlocked.");
  });

  it("waits for Stripe's confirmation after checkout, refreshing a few times", () => {
    vi.useFakeTimers();
    setup({ plan: "Free", checkout: "success" });
    expect(screen.getByRole("status")).toHaveTextContent("Payment received. Activating Pro");
    act(() => vi.advanceTimersByTime(3000));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(10);
  });

  describe("a cancelled plan that has not ended yet (DIG-99)", () => {
    const ENDS = "2026-12-20T14:24:49.000Z";

    it("tells a Pro creator when Pro ends, and how to keep it", () => {
      setup({ plan: "Pro", endsAt: ENDS });
      expect(screen.getByRole("status")).toHaveTextContent("Your Pro plan ends on 20 December 2026. You keep Pro until then.");
      expect(screen.getByRole("status")).toHaveTextContent(/manage subscription/i);
      expect(screen.getByRole("button", { name: "Manage subscription" })).toBeEnabled();
    });

    it("says nothing extra when the plan is not ending", () => {
      setup({ plan: "Pro", endsAt: null });
      expect(screen.queryByText(/your pro plan ends/i)).not.toBeInTheDocument();
    });

    it("never shows it for a Free creator or an admin", () => {
      setup({ plan: "Free", endsAt: ENDS });
      expect(screen.queryByText(/your pro plan ends/i)).not.toBeInTheDocument();
    });

    it("shows it next to a failed-payment warning without hiding either", () => {
      setup({ plan: "Pro", endsAt: ENDS, paymentFailed: true });
      expect(screen.getByRole("alert")).toHaveTextContent(/last payment failed/i);
      expect(screen.getByText(/your pro plan ends on 20 December 2026/i)).toBeInTheDocument();
    });
  });
});
