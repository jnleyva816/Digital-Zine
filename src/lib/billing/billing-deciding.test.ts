import { describe, expect, it } from "vitest";
import { decidingSubscription } from "./billing";

describe("decidingSubscription (DIG-39)", () => {
  it("prefers active, then trialing, then past due, and the newest on a tie", () => {
    const s = (id: string, status: string, created: number) => ({ id, status, created });
    expect(decidingSubscription([s("a", "canceled", 300), s("b", "past_due", 100), s("c", "active", 50)])?.id).toBe("c");
    expect(decidingSubscription([s("a", "trialing", 100), s("b", "past_due", 300)])?.id).toBe("a");
    expect(decidingSubscription([s("a", "canceled", 100), s("b", "canceled", 300)])?.id).toBe("b");
    expect(decidingSubscription([])).toBeNull();
  });
});
