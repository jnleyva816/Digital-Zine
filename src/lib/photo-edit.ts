import { z } from "zod";
import "@/lib/zod-setup";

/**
 * How a photo is cropped and framed (DIG-33). Edits are settings stored on the photo; the stored
 * image never changes. Every renderer (board, editor, public viewer, PDF) goes through
 * `cropRect`, so they all show the same crop. Client-safe: no Node imports.
 */

export const PHOTO_RATIOS = [
  { value: "original", label: "Original" },
  { value: "4:5", label: "4:5" },
  { value: "1:1", label: "1:1" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
  { value: "16:9", label: "16:9" },
] as const;

export const PHOTO_FRAMES = [
  { value: "none", label: "None" },
  { value: "thin-white", label: "Thin white" },
  { value: "white-mat", label: "White mat" },
  { value: "black", label: "Black" },
  { value: "polaroid", label: "Polaroid" },
] as const;

export const CARD_SIZES = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
] as const;

export const MAX_ZOOM = 4;

const ratioValues = PHOTO_RATIOS.map((r) => r.value) as [string, ...string[]];
const frameValues = PHOTO_FRAMES.map((f) => f.value) as [string, ...string[]];

export const photoEditSchema = z
  .object({
    ratio: z.enum(ratioValues as ["original", "4:5", "1:1", "3:2", "2:3", "16:9"]),
    zoom: z.number().min(1).max(MAX_ZOOM),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    frame: z.enum(frameValues as ["none", "thin-white", "white-mat", "black", "polaroid"]),
    cardSize: z.enum(["normal", "large"]),
  })
  .strict();

export type PhotoEdit = z.infer<typeof photoEditSchema>;
export type PhotoRatio = PhotoEdit["ratio"];
export type PhotoFrame = PhotoEdit["frame"];

/** An unedited photo: exactly how the board and zines have always shown photos. */
export const DEFAULT_EDIT: PhotoEdit = { ratio: "4:5", zoom: 1, x: 0.5, y: 0.5, frame: "none", cardSize: "normal" };

export function isDefaultEdit(edit: PhotoEdit): boolean {
  return (Object.keys(DEFAULT_EDIT) as (keyof PhotoEdit)[]).every((k) => edit[k] === DEFAULT_EDIT[k]);
}

/** A stored edit, or null when there is none or it cannot be read. */
export function parsePhotoEdit(value: unknown): PhotoEdit | null {
  const parsed = photoEditSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

type Dims = { width: number; height: number } | null | undefined;
type Box = { left: number; top: number; width: number; height: number };

const FIXED_RATIOS: Record<Exclude<PhotoRatio, "original">, number> = {
  "4:5": 4 / 5,
  "1:1": 1,
  "3:2": 3 / 2,
  "2:3": 2 / 3,
  "16:9": 16 / 9,
};

const imageAspect = (dims: Dims) => (dims && dims.width > 0 && dims.height > 0 ? dims.width / dims.height : null);

/** Width ÷ height of the cropped photo. Original uses the photo's own shape (4:5 if unknown). */
export function targetAspect(edit: PhotoEdit, dims: Dims): number {
  if (edit.ratio === "original") return imageAspect(dims) ?? FIXED_RATIOS["4:5"];
  return FIXED_RATIOS[edit.ratio];
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * The part of the photo that shows, as fractions of its width and height. At zoom 1 it is the
 * largest crop of the target ratio; zoom shrinks it around the focal point, kept inside the photo.
 */
export function cropRect(edit: PhotoEdit, dims: Dims): Box {
  const target = targetAspect(edit, dims);
  // Without a known size, assume the photo already has the target shape.
  const source = imageAspect(dims) ?? target;
  let width = 1;
  let height = 1;
  if (target > source) height = source / target;
  else width = target / source;
  width /= edit.zoom;
  height /= edit.zoom;
  return {
    left: clamp(edit.x - width / 2, 0, 1 - width),
    top: clamp(edit.y - height / 2, 0, 1 - height),
    width,
    height,
  };
}

/** Border widths as fractions of the photo's width, and the border colour. */
const FRAME_SPECS: Record<PhotoFrame, { top: number; right: number; bottom: number; left: number; color: string } | null> = {
  none: null,
  "thin-white": { top: 0.02, right: 0.02, bottom: 0.02, left: 0.02, color: "#ffffff" },
  "white-mat": { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08, color: "#ffffff" },
  black: { top: 0.03, right: 0.03, bottom: 0.03, left: 0.03, color: "#111111" },
  polaroid: { top: 0.05, right: 0.05, bottom: 0.2, left: 0.05, color: "#ffffff" },
};

/**
 * Layout for the web, in percentages. `aspect` is the framed photo's width ÷ height. `photo` is
 * the cropped photo's box inside the frame; `image` is the full image's box inside `photo`, so
 * the crop shows through. `background` is the frame colour, or null for no frame.
 */
export function frameLayout(edit: PhotoEdit, dims: Dims) {
  const crop = cropRect(edit, dims);
  const photoAspect = targetAspect(edit, dims);
  const spec = FRAME_SPECS[edit.frame];
  const outerW = 1 + (spec ? spec.left + spec.right : 0);
  const outerH = 1 / photoAspect + (spec ? spec.top + spec.bottom : 0);
  return {
    aspect: outerW / outerH,
    photo: spec
      ? {
          left: (spec.left / outerW) * 100,
          top: (spec.top / outerH) * 100,
          width: (1 / outerW) * 100,
          height: (1 / photoAspect / outerH) * 100,
        }
      : { left: 0, top: 0, width: 100, height: 100 },
    image: {
      left: (-crop.left / crop.width) * 100,
      top: (-crop.top / crop.height) * 100,
      width: (1 / crop.width) * 100,
      height: (1 / crop.height) * 100,
    },
    background: spec?.color ?? null,
  };
}

/** Whole-pixel crop and border sizes for sharp, used by the PDF. */
export function cropPixels(edit: PhotoEdit, dims: { width: number; height: number }) {
  const crop = cropRect(edit, dims);
  const extract = {
    left: Math.round(crop.left * dims.width),
    top: Math.round(crop.top * dims.height),
    width: Math.max(1, Math.round(crop.width * dims.width)),
    height: Math.max(1, Math.round(crop.height * dims.height)),
  };
  extract.width = Math.min(extract.width, dims.width - extract.left);
  extract.height = Math.min(extract.height, dims.height - extract.top);
  const spec = FRAME_SPECS[edit.frame];
  const px = (f: number) => Math.round(f * extract.width);
  return {
    extract,
    border: spec
      ? { top: px(spec.top), right: px(spec.right), bottom: px(spec.bottom), left: px(spec.left), color: spec.color }
      : null,
  };
}
