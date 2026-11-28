import { describe, expect, it } from "vitest";
import { effectiveAccess } from "./entitlements";

describe("effectiveAccess", () => {
  it("gives admins Pro without a subscription", () => {
    expect(effectiveAccess({ role: "admin", tier: "free" }, false)).toEqual({
      tier: "pro",
      isAdmin: true,
      viewingAsFree: false,
    });
  });

  it("treats an admin viewing as Free exactly like a Free user", () => {
    expect(effectiveAccess({ role: "admin", tier: "pro" }, true)).toEqual({
      tier: "free",
      isAdmin: true,
      viewingAsFree: true,
    });
  });

  it("leaves regular users on their billed tier and ignores the cookie", () => {
    expect(effectiveAccess({ role: "user", tier: "pro" }, true)).toEqual({
      tier: "pro",
      isAdmin: false,
      viewingAsFree: false,
    });
    expect(effectiveAccess({ role: "user", tier: "free" }, false)).toEqual({
      tier: "free",
      isAdmin: false,
      viewingAsFree: false,
    });
  });
});
