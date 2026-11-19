import { describe, expect, it } from "vitest";
import { authSecretProblem } from "./env";

const prod = (over: Record<string, string | undefined>) => ({ NODE_ENV: "production", ...over });
const STRONG = "k3Vd9q0mZ8yX2wP5tR7uB1nC4eH6jL0sA9fG2hJ5kL8=";

describe("authSecretProblem (DIG-42)", () => {
  it("accepts a real secret in production", () => {
    expect(authSecretProblem(prod({ AUTH_SECRET: STRONG }))).toBeNull();
  });

  it("refuses a missing, short, or committed secret in production, and says how to make one", () => {
    for (const AUTH_SECRET of [
      undefined,
      "   ",
      "too-short",
      "dev-digital-zine-secret-change-in-production-32chars",
      "test-digital-zine-secret-not-for-production-32chars",
    ]) {
      const problem = authSecretProblem(prod({ AUTH_SECRET }));
      expect(problem, String(AUTH_SECRET)).toMatch(/AUTH_SECRET/);
      expect(problem).toContain("openssl rand -base64 32");
    }
  });

  it("allows the committed test secret only when the end-to-end tests ask for it", () => {
    const testSecret = "test-digital-zine-secret-not-for-production-32chars";
    expect(authSecretProblem(prod({ AUTH_SECRET: testSecret, ALLOW_TEST_AUTH_SECRET: "1" }))).toBeNull();
    expect(
      authSecretProblem(prod({ AUTH_SECRET: "dev-digital-zine-secret-change-in-production-32chars", ALLOW_TEST_AUTH_SECRET: "1" }))
    ).not.toBeNull();
  });

  it("does not check outside production or during next build", () => {
    expect(authSecretProblem({ NODE_ENV: "development", AUTH_SECRET: "" })).toBeNull();
    expect(authSecretProblem(prod({ AUTH_SECRET: "", NEXT_PHASE: "phase-production-build" }))).toBeNull();
  });
});
