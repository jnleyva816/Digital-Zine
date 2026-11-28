import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDIT,
  cropPixels,
  cropRect,
  frameLayout,
  isDefaultEdit,
  parsePhotoEdit,
  photoEditSchema,
  targetAspect,
  type PhotoEdit,
} from "./photo-edit";

const edit = (over: Partial<PhotoEdit> = {}): PhotoEdit => ({ ...DEFAULT_EDIT, ...over });
/** A 3:2 landscape camera frame, like the X-T5. */
const LANDSCAPE = { width: 6000, height: 4000 };

describe("photo edit settings (DIG-33)", () => {
  it("starts as the board has always shown photos: 4:5, centred, no zoom, no frame, normal card", () => {
    expect(DEFAULT_EDIT).toEqual({ ratio: "4:5", zoom: 1, x: 0.5, y: 0.5, frame: "none", cardSize: "normal" });
    expect(isDefaultEdit(edit())).toBe(true);
    expect(isDefaultEdit(edit({ frame: "polaroid" }))).toBe(false);
  });

  it("accepts the decided ratios, frames, and card sizes, with zoom 1–4 and a focal point inside the photo", () => {
    for (const ratio of ["original", "4:5", "1:1", "3:2", "2:3", "16:9"]) {
      expect(photoEditSchema.safeParse(edit({ ratio } as Partial<PhotoEdit>)).success, ratio).toBe(true);
    }
    for (const frame of ["none", "thin-white", "white-mat", "black", "polaroid"]) {
      expect(photoEditSchema.safeParse(edit({ frame } as Partial<PhotoEdit>)).success, frame).toBe(true);
    }
    const bad = [{ ratio: "5:4" }, { frame: "gold" }, { cardSize: "huge" }, { zoom: 0.5 }, { zoom: 4.5 }, { x: -0.1 }, { y: 1.2 }];
    for (const over of bad) expect(photoEditSchema.safeParse({ ...DEFAULT_EDIT, ...over }).success, JSON.stringify(over)).toBe(false);
    expect(photoEditSchema.safeParse({ ...DEFAULT_EDIT, extra: 1 }).success).toBe(false);
  });

  it("reads stored edits, and treats anything unreadable as no edit", () => {
    expect(parsePhotoEdit(edit({ ratio: "1:1" }))).toEqual(edit({ ratio: "1:1" }));
    expect(parsePhotoEdit(null)).toBeNull();
    expect(parsePhotoEdit({ ratio: "nope" })).toBeNull();
  });
});

describe("targetAspect", () => {
  it("is the chosen ratio, or the photo's own shape for Original (4:5 when the size is unknown)", () => {
    expect(targetAspect(edit({ ratio: "16:9" }), LANDSCAPE)).toBeCloseTo(16 / 9);
    expect(targetAspect(edit({ ratio: "original" }), LANDSCAPE)).toBeCloseTo(1.5);
    expect(targetAspect(edit({ ratio: "original" }), null)).toBeCloseTo(0.8);
  });
});

describe("cropRect", () => {
  it("takes the largest centred crop of the ratio at zoom 1", () => {
    // A square from a 3:2 photo uses the full height and two thirds of the width.
    const r = cropRect(edit({ ratio: "1:1" }), LANDSCAPE);
    expect(r.width).toBeCloseTo(2 / 3);
    expect(r.height).toBeCloseTo(1);
    expect(r.left).toBeCloseTo(1 / 6);
    expect(r.top).toBeCloseTo(0);
  });

  it("zooms in around the focal point and keeps the crop inside the photo", () => {
    const zoomed = cropRect(edit({ ratio: "1:1", zoom: 2, x: 0.25, y: 0.25 }), LANDSCAPE);
    expect(zoomed.width).toBeCloseTo(1 / 3);
    expect(zoomed.height).toBeCloseTo(0.5);
    expect(zoomed.left).toBeCloseTo(0.25 - 1 / 6);
    expect(zoomed.top).toBeCloseTo(0);

    const corner = cropRect(edit({ ratio: "1:1", zoom: 2, x: 1, y: 1 }), LANDSCAPE);
    expect(corner.left + corner.width).toBeCloseTo(1);
    expect(corner.top + corner.height).toBeCloseTo(1);
  });

  it("shows the whole photo for Original at zoom 1", () => {
    expect(cropRect(edit({ ratio: "original" }), LANDSCAPE)).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });
});

describe("frameLayout", () => {
  it("is just the crop when there is no frame", () => {
    const l = frameLayout(edit({ ratio: "1:1" }), LANDSCAPE);
    expect(l.aspect).toBeCloseTo(1);
    expect(l.photo).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    expect(l.background).toBeNull();
    // The image is 1.5× the box wide and shifted left by a quarter of the box.
    expect(l.image.width).toBeCloseTo(150);
    expect(l.image.height).toBeCloseTo(100);
    expect(l.image.left).toBeCloseTo(-25);
    expect(l.image.top).toBeCloseTo(0);
  });

  it("adds a Polaroid border with a deeper bottom edge", () => {
    const l = frameLayout(edit({ ratio: "1:1", frame: "polaroid" }), LANDSCAPE);
    // Borders are fractions of the photo's width: 5% on three sides, 20% at the bottom.
    expect(l.aspect).toBeCloseTo(1.1 / 1.25);
    expect(l.background).toBe("#ffffff");
    expect(l.photo.left).toBeCloseTo((0.05 / 1.1) * 100);
    expect(l.photo.top).toBeCloseTo((0.05 / 1.25) * 100);
    expect(l.photo.width).toBeCloseTo((1 / 1.1) * 100);
    expect(l.photo.height).toBeCloseTo((1 / 1.25) * 100);
  });

  it("uses black for the black border", () => {
    expect(frameLayout(edit({ frame: "black" }), LANDSCAPE).background).toBe("#111111");
  });
});

describe("cropPixels", () => {
  it("gives whole-pixel crop and border sizes for the PDF", () => {
    const p = cropPixels(edit({ ratio: "1:1", frame: "white-mat" }), LANDSCAPE);
    expect(p.extract).toEqual({ left: 1000, top: 0, width: 4000, height: 4000 });
    // An 8% mat on a 4000 px wide crop.
    expect(p.border).toEqual({ top: 320, right: 320, bottom: 320, left: 320, color: "#ffffff" });
  });

  it("has no border without a frame", () => {
    expect(cropPixels(edit(), LANDSCAPE).border).toBeNull();
  });
});
