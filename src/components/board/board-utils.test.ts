import { describe, expect, it } from "vitest";
import { assetLabel, exifBadges, moveItem } from "./board-utils";
import { readApiError, toBoardAsset } from "./types";

describe("exifBadges", () => {
  it("lists ISO, aperture, shutter, and focal length in order, skipping blanks", () => {
    expect(
      exifBadges({ iso: 200, aperture: "f/2.0", shutterSpeed: "", focalLength: "35mm", cameraModel: "M11" })
    ).toEqual(["ISO 200", "f/2.0", "35mm"]);
  });

  it("returns nothing without EXIF", () => {
    expect(exifBadges(null)).toEqual([]);
    expect(exifBadges({ iso: null })).toEqual([]);
  });
});

describe("moveItem", () => {
  it("moves without mutating the input", () => {
    const list = ["a", "b", "c", "d"];
    expect(moveItem(list, 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });
});

describe("assetLabel", () => {
  it("uses the file name, or a numbered fallback", () => {
    const base = toBoardAsset({ id: "1", publicUrl: "/x", kind: "photo" });
    expect(assetLabel({ ...base, originalName: " cellar.jpg " }, 0)).toBe("cellar.jpg");
    expect(assetLabel(base, 2)).toBe("Photo 3");
  });
});

describe("toBoardAsset", () => {
  it("normalizes kind, EXIF, and recipe", () => {
    expect(
      toBoardAsset({ id: "1", publicUrl: "/x", kind: "weird", exif: { iso: 100 }, recipe: { title: "" } })
    ).toMatchObject({ kind: "photo", originalName: null, exif: { iso: 100 }, recipe: null });
  });
});

describe("readApiError", () => {
  it("reads { error } from JSON, else falls back", async () => {
    await expect(readApiError(Response.json({ error: "Nope" }, { status: 409 }), "fallback")).resolves.toBe("Nope");
    await expect(readApiError(new Response("<html>", { status: 500 }), "fallback")).resolves.toBe("fallback");
    await expect(readApiError(Response.json({ error: "  " }), "fallback")).resolves.toBe("fallback");
  });
});
