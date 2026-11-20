import { describe, expect, it } from "vitest";
import { ACCEPTED_IMAGE_TYPES } from "./types";

describe("board upload picker (DIG-36)", () => {
  it("offers JPEG only, as the owner decided", () => {
    expect([...ACCEPTED_IMAGE_TYPES]).toEqual(["image/jpeg"]);
  });
});
