// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSubscription } from "@/lib/admin-subscriptions";
import { AdminNav } from "./AdminNav";
import { SubscriptionList } from "./SubscriptionList";

// DIG-139: the admin panel's subscriptions, read-only.
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const sub = (id: string, extra: Partial<AdminSubscription> = {}): AdminSubscription => ({
  userId: id,
  email: `${id}@test.local`,
  status: "active",
  deactivated: false,
  stripeUrl: `https://dashboard.stripe.com/test/subscriptions/sub_${id}`,
  ...extra,
});
const show = (subscriptions: AdminSubscription[], nextCursor: string | null = null, billingConfigured = true) =>
  render(<SubscriptionList initial={{ subscriptions, nextCursor, billingConfigured }} />);
const items = () => within(screen.getByRole("list", { name: "Subscriptions" })).getAllByRole("listitem");

describe("SubscriptionList", () => {
  it("shows each status in words, and links to Stripe in a new tab", () => {
    show([sub("a"), sub("b", { status: "past_due", deactivated: true }), sub("c", { status: "trialing" })]);
    const [a, b, c] = items();
    const link = within(a).getByRole("link", { name: "Open a@test.local’s subscription in Stripe (opens in a new tab)" });
    expect(link).toHaveAttribute("href", "https://dashboard.stripe.com/test/subscriptions/sub_a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(a).getByText("Active")).toBeInTheDocument();
    expect(within(b).getByText("Payment failed")).toBeInTheDocument();
    expect(within(b).getByText("Deactivated: ends at period end")).toBeInTheDocument();
    expect(within(c).getByText("Trial")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });

  it("explains when billing is not set up, and gives no links", () => {
    show([sub("a", { stripeUrl: null })], null, false);
    expect(screen.getByRole("note")).toHaveTextContent("Billing is not set up in this environment");
    expect(within(items()[0]).queryByRole("link")).not.toBeInTheDocument();
  });

  it("says when nobody is paying", () => {
    show([]);
    expect(screen.getByText("No active subscriptions.")).toBeInTheDocument();
  });

  it("loads more, and shows an error without losing the list", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ subscriptions: [sub("b")], nextCursor: "c2", billingConfigured: true }));
    fetchMock.mockResolvedValueOnce(Response.json({ error: "You're searching too quickly." }, { status: 429 }));
    show([sub("a")], "c1");
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/subscriptions?cursor=c1");
    expect(await screen.findByText("b@test.local")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You're searching too quickly.");
    expect(items()).toHaveLength(2);
  });
});

describe("AdminNav", () => {
  it("has a Subscriptions section", () => {
    render(<AdminNav current="subscriptions" />);
    expect(within(screen.getByRole("navigation", { name: "Admin" })).getByRole("link", { name: "Subscriptions" })).toHaveAttribute("aria-current", "page");
  });
});
