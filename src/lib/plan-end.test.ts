import { beforeEach, describe, expect, it, vi } from "vitest";

// DIG-99: when a cancelled Pro plan ends, read from Stripe.
const retrieve = vi.fn();
const getStripeClient = vi.fn();
vi.mock("@/lib/stripe", () => ({ getStripeClient: () => getStripeClient() }));

import { fetchPlanEnd, scheduledEnd } from "./plan-end";

const DEC_20 = 1797776689; // 2026-12-20T14:24:49Z

beforeEach(() => {
  retrieve.mockReset();
  getStripeClient.mockReset();
  getStripeClient.mockReturnValue({ subscriptions: { retrieve } });
});

describe("scheduledEnd", () => {
  it("is the cancel date of an active subscription set to cancel", () => {
    expect(scheduledEnd({ status: "active", cancel_at: DEC_20 })?.toISOString()).toBe("2026-12-20T14:24:49.000Z");
  });

  it.each(["trialing", "past_due"])("also applies while %s, which still counts as Pro", (status) => {
    expect(scheduledEnd({ status, cancel_at: DEC_20 })).toBeInstanceOf(Date);
  });

  it("is null for a subscription that is not cancelling", () => {
    expect(scheduledEnd({ status: "active", cancel_at: null })).toBeNull();
    expect(scheduledEnd({ status: "active" })).toBeNull();
  });

  it("falls back to the paid period's end when only cancel_at_period_end is set", () => {
    const sub = { status: "active", cancel_at: null, cancel_at_period_end: true, items: { data: [{ current_period_end: DEC_20 }] } };
    expect(scheduledEnd(sub)?.toISOString()).toBe("2026-12-20T14:24:49.000Z");
  });

  it("is null once the subscription has ended", () => {
    expect(scheduledEnd({ status: "canceled", cancel_at: DEC_20 })).toBeNull();
    expect(scheduledEnd({ status: "unpaid", cancel_at: DEC_20 })).toBeNull();
  });
});

describe("fetchPlanEnd", () => {
  it("reads the subscription from Stripe and returns its end date", async () => {
    retrieve.mockResolvedValue({ status: "active", cancel_at: DEC_20 });
    expect((await fetchPlanEnd("sub_123"))?.toISOString()).toBe("2026-12-20T14:24:49.000Z");
    expect(retrieve).toHaveBeenCalledWith("sub_123");
  });

  it("is null, without calling Stripe, when there is no subscription id", async () => {
    expect(await fetchPlanEnd(null)).toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("is null when Stripe is not configured", async () => {
    getStripeClient.mockReturnValue(null);
    expect(await fetchPlanEnd("sub_123")).toBeNull();
  });

  it("is null, and does not throw, when Stripe cannot be reached", async () => {
    retrieve.mockRejectedValue(new Error("network down"));
    await expect(fetchPlanEnd("sub_123")).resolves.toBeNull();
  });

  it("is null for a subscription that is not cancelling", async () => {
    retrieve.mockResolvedValue({ status: "active", cancel_at: null });
    expect(await fetchPlanEnd("sub_123")).toBeNull();
  });
});
