import { describe, expect, it } from "vitest";
import { stripeDashboardUrl } from "./admin-subscriptions";

// DIG-139: each subscription links to the Stripe Dashboard of the mode the key belongs to.
describe("stripeDashboardUrl", () => {
  it("links test-mode and sandbox keys to the test Dashboard", () => {
    for (const key of ["sk_test_abc", "rk_test_abc"]) {
      expect(stripeDashboardUrl("sub_123ABC", key)).toBe("https://dashboard.stripe.com/test/subscriptions/sub_123ABC");
    }
  });
  it("links live keys to the live Dashboard", () => {
    for (const key of ["sk_live_abc", "rk_live_abc"]) {
      expect(stripeDashboardUrl("sub_123ABC", key)).toBe("https://dashboard.stripe.com/subscriptions/sub_123ABC");
    }
  });
  it("gives no link without a key, with a key of unknown kind, or for an id that is not a subscription", () => {
    expect(stripeDashboardUrl("sub_123", undefined)).toBeNull();
    expect(stripeDashboardUrl("sub_123", "  ")).toBeNull();
    expect(stripeDashboardUrl("sub_123", "pk_live_abc")).toBeNull();
    for (const id of ["cus_123", "sub_../x", "sub_", "sub_123?x=1"]) expect(stripeDashboardUrl(id, "sk_live_abc"), id).toBeNull();
  });
});
