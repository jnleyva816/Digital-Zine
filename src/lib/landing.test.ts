import { describe, expect, it } from "vitest";
import { ACCOUNT_STORAGE_BYTES, boardLimitFor, formatBytes, zineLimitFor } from "./limits";
import { PRO_MONTHLY_PRICE_CENTS } from "./stripe";
import { landingTiers, SIGNUP_HREF } from "./landing";

describe("landing page tiers (DIG-95)", () => {
  const [free, pro] = landingTiers();

  it("lists Free then Pro, priced from the billing constant", () => {
    expect(free.name).toBe("Free");
    expect(free.price).toBe("$0");
    expect(pro.name).toBe("Pro");
    expect(pro.price).toBe(`$${PRO_MONTHLY_PRICE_CENTS / 100}`);
    expect(pro.period).toBe("per month");
  });

  it("takes every number from the limits the app enforces, so the page cannot drift", () => {
    const boards = boardLimitFor("free");
    const zines = zineLimitFor("free");
    expect(free.features).toContain(`${boards} Vision Board`);
    expect(free.features).toContain(`${zines} zine`);
    expect(free.features).toContain(`${formatBytes(ACCOUNT_STORAGE_BYTES)} of photo storage`);
    expect(pro.features).toContain("Unlimited Vision Boards");
    expect(pro.features).toContain("Unlimited zines");
    expect(pro.features).toContain("PDF export");
    expect(free.features).not.toContain("PDF export");
  });

  it("sends sign-up buttons to the sign-up page (DIG-97)", () => {
    expect(SIGNUP_HREF).toBe("/signup");
  });
});
