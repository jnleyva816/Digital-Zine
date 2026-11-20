import { describe, expect, it } from "vitest";
import { isValidStorageKey, isWellFormedStorageKey } from "./keys";

const me = "user123";

describe("isValidStorageKey (DIG-35)", () => {
  it("accepts keys under my own folder, as the server builds them", () => {
    expect(isValidStorageKey(me, `users/${me}/1795033492437-127aa482daf1-dscf1368.jpg`)).toBe(true);
    expect(isValidStorageKey(me, `users/${me}/1795033492437-127aa482daf1-dscf1368/full.avif`)).toBe(true);
  });

  it("refuses keys that climb out of my folder, however they are written", () => {
    for (const key of [
      `users/${me}/../victim/k/full.avif`,
      `users/${me}/./x.jpg`,
      `users/${me}//x.jpg`,
      `/users/${me}/x.jpg`,
      `users/${me}\\..\\victim\\x.jpg`,
      `users/${me}/`,
      `users/${me}`,
      `users/other/x.jpg`,
      `users/${me}x/x.jpg`,
      `users/${me}/x.jpg\u0000.html`,
      `seed/plate-01.jpg`,
      "",
    ]) {
      expect(isValidStorageKey(me, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("refuses anything that is not a string", () => {
    expect(isValidStorageKey(me, undefined)).toBe(false);
    expect(isValidStorageKey(me, ["users", me, "x.jpg"])).toBe(false);
  });
});

describe("isWellFormedStorageKey (DIG-35)", () => {
  it("tells a malformed key (400) from a well-formed key in someone else's folder (403)", () => {
    expect(isWellFormedStorageKey("users/other/x.jpg")).toBe(true);
    expect(isWellFormedStorageKey("users/me/../other/x.jpg")).toBe(false);
    expect(isWellFormedStorageKey("users/me/%2e%2e/x.jpg")).toBe(false);
  });
});

