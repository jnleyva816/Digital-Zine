import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, resetPasswordSchema } from "./password-reset-schema";

// DIG-107: the reset form and the server share these rules, which are sign-up's rules.
const ok = { token: "abc", password: "correct-horse-9", confirmPassword: "correct-horse-9" };
const messages = (input: unknown) => {
  const parsed = resetPasswordSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
};

describe("resetPasswordSchema", () => {
  it("accepts a good password typed twice", () => {
    expect(resetPasswordSchema.safeParse(ok).success).toBe(true);
  });

  it("asks for at least 8 and at most 72 characters, as sign-up does", () => {
    expect(messages({ ...ok, password: "short1", confirmPassword: "short1" })).toEqual(["Use at least 8 characters."]);
    const long = "a".repeat(73);
    expect(messages({ ...ok, password: long, confirmPassword: long })).toEqual(["Use at most 72 characters."]);
    const edge = "a".repeat(72);
    expect(messages({ ...ok, password: edge, confirmPassword: edge })).toEqual([]);
  });

  it("asks for the same password twice", () => {
    expect(messages({ ...ok, confirmPassword: "different-pass-1" })).toEqual(["The passwords do not match."]);
  });

  it("needs a token, and a missing password says so", () => {
    expect(resetPasswordSchema.safeParse({ ...ok, token: "" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...ok, token: "x".repeat(201) }).success).toBe(false);
    expect(messages({ token: "abc", confirmPassword: "x" })).toContain("Choose a password.");
  });
});

describe("forgotPasswordSchema", () => {
  it("trims and lower-cases the email", () => {
    expect(forgotPasswordSchema.parse({ email: "  Ada@Example.COM " })).toEqual({ email: "ada@example.com" });
  });

  it("refuses something that is not an email, or is too long", () => {
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).error?.issues[0].message).toBe("Enter a valid email address.");
    expect(forgotPasswordSchema.safeParse({ email: `${"a".repeat(250)}@b.co` }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({}).success).toBe(false);
  });
});
