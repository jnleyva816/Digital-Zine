import { z } from "zod";
import "@/lib/infra/zod-setup";

/**
 * A board's free-form layout (DIG-85), shared by the API and the board. Client-safe: no Node imports.
 * Positions are in board units: pixels at 100% zoom.
 */
export const PLACEMENT_WIDTH = { min: 110, max: 380 } as const;
export const MAX_TILT = 15;
export const NOTE_TEXT_MAX = 280;
export const MAX_BOARD_NOTES = 200;
/** A board tops out near 1,000 photos, so one save can hold them all. */
const MAX_BATCH = 1000;
const EDGE = 50_000;

const spot = {
  x: z.number().min(-EDGE).max(EDGE),
  y: z.number().min(-EDGE).max(EDGE),
  width: z.number().min(PLACEMENT_WIDTH.min).max(PLACEMENT_WIDTH.max),
  rotation: z.number().min(-MAX_TILT).max(MAX_TILT),
  z: z.number().int().min(0).max(1_000_000),
};

const id = z.string().min(1).max(64);
const noteText = z
  .string()
  .trim()
  .min(1, "Write something on the note.")
  .max(NOTE_TEXT_MAX, `Notes can be up to ${NOTE_TEXT_MAX} characters.`);

export const placementSchema = z.object({ assetId: id, ...spot, look: z.enum(["print", "plain"]), tape: z.boolean() }).strict();
export const noteSchema = z.object({ text: noteText, ...spot }).strict();
export const notePatchSchema = z.object({ text: noteText }).strict();
const noteSpotSchema = z.object({ id, ...spot }).strict();

export type Placement = z.infer<typeof placementSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type NoteSpot = z.infer<typeof noteSpotSchema>;
export interface BoardNote extends NoteInput {
  id: string;
}

const unique = (ids: string[]) => new Set(ids).size === ids.length;

/** Everything one drag, Tidy up, or Scatter changed. */
export const layoutChangeSchema = z
  .object({
    placements: z.array(placementSchema).max(MAX_BATCH).default([]),
    removed: z.array(id).max(MAX_BATCH).default([]),
    notes: z.array(noteSpotSchema).max(MAX_BOARD_NOTES).default([]),
  })
  .strict()
  .refine((c) => c.placements.length + c.removed.length + c.notes.length > 0, "Nothing to save.")
  .refine((c) => unique([...c.placements.map((p) => p.assetId), ...c.removed]) && unique(c.notes.map((n) => n.id)), "Each item can change once in a save.");

export type BoardView = "free" | "grid" | "strip";
export const GRID_LAYOUTS = ["masonry", "even", "feature"] as const;
export type GridLayout = (typeof GRID_LAYOUTS)[number];

/** Free form needs a wide screen (owner, 19 Nov 2026), so narrow ones never remember it. */
export const boardViewPrefsSchema = z
  .object({
    wide: z.enum(["free", "grid", "strip"]).optional(),
    narrow: z.enum(["grid", "strip"]).optional(),
    gridLayout: z.enum(GRID_LAYOUTS).optional(),
  })
  .strict();
export type BoardViewPrefs = z.infer<typeof boardViewPrefsSchema>;

export function parseViewPrefs(value: unknown): BoardViewPrefs {
  const parsed = boardViewPrefsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}
