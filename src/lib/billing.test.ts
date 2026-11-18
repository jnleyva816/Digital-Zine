import { describe, expect, it } from "vitest";
import { describeSubscription, tierForStatus } from "./billing";

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
