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
});
