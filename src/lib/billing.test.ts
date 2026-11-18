import { afterEach, describe, expect, it, vi } from "vitest";
import { automaticTaxEnabled, describeSubscription, tierForStatus } from "./billing";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tierForStatus", () => {
  it.each(["active", "trialing", "past_due"])("%s keeps Pro", (status) => {
    expect(tierForStatus(status)).toBe("pro");
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "inactive", ""])(
    "%s is Free",
    (status) => {
      expect(tierForStatus(status)).toBe("free");
    }
  );
});

describe("describeSubscription", () => {
  it("flags a failed payment while Pro is kept", () => {
    expect(describeSubscription({ tier: "pro", subscriptionStatus: "past_due" })).toEqual({
      plan: "Pro",
      paymentFailed: true,
    });
  });

  it("describes healthy Pro and Free accounts", () => {
    expect(describeSubscription({ tier: "pro", subscriptionStatus: "active" })).toEqual({ plan: "Pro", paymentFailed: false });
    expect(describeSubscription({ tier: "free", subscriptionStatus: "canceled" })).toEqual({ plan: "Free", paymentFailed: false });
  });
});

describe("automaticTaxEnabled", () => {
  it('is on only when STRIPE_AUTOMATIC_TAX is "true" (ignoring case and spaces)', () => {
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "true");
    expect(automaticTaxEnabled()).toBe(true);
    for (const value of ["", "false", "1", "yes", "TRUE "]) {
      vi.stubEnv("STRIPE_AUTOMATIC_TAX", value);
      expect(automaticTaxEnabled()).toBe(value.trim().toLowerCase() === "true");
    }
  });
});
