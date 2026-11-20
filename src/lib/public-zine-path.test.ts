import { describe, expect, it } from "vitest";
import { publicZinePath } from "./public-zine-path";

// DIG-102: a zine's public address includes its creator.
describe("publicZinePath", () => {
  it("is /z/<creator>/<slug>", () => {
    expect(publicZinePath("k7x2m9ab", "golden-hour")).toBe("/z/k7x2m9ab/golden-hour");
  });

  it("encodes anything that is not path-safe, so a slug can never change the route", () => {
    expect(publicZinePath("ab12", "a b/c?d#e")).toBe("/z/ab12/a%20b%2Fc%3Fd%23e");
  });
});
