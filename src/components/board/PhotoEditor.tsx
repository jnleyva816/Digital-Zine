"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EditedPhoto } from "@/components/EditedPhoto";
import {
  CARD_SIZES,
  DEFAULT_EDIT,
  MAX_ZOOM,
  PHOTO_FRAMES,
  PHOTO_RATIOS,
  cropRect,
  frameLayout,
  isDefaultEdit,
  type PhotoEdit,
} from "@/lib/photo-edit";
import { quoteList } from "./board-utils";

/** How far one arrow-key press moves the photo, as a fraction of its width or height. */
const KEY_STEP = 0.02;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

interface PhotoEditorProps {
  open: boolean;
  /** The photo's label, for the heading. */
  label: string;
  src: string;
  blurDataUrl?: string | null;
  dims: { width: number; height: number } | null;
  /** The saved edit, or null when the photo is unedited. */
  initial: PhotoEdit | null;
  /** Titles of zines whose pages use this photo. */
  usedIn: string[];
  /** Persist the edit; null clears it. Resolve with an error message to stay open. */
  onSave: (edit: PhotoEdit | null) => Promise<string | null>;
  onClose: () => void;
}

/**
 * Crop, zoom, reposition, frame, and card size for one photo (DIG-33), with a live preview.
 * Drag the preview or use the arrow keys to move the photo in its frame.
 */
export function PhotoEditor({ open, label, src, blurDataUrl, dims, initial, usedIn, onSave, onClose }: PhotoEditorProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photoBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<PhotoEdit>(initial ?? DEFAULT_EDIT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setDraft(initial ?? DEFAULT_EDIT);
      setError(null);
      setSaving(false);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
    // Reset the draft only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (patch: Partial<PhotoEdit>) => setDraft((d) => ({ ...d, ...patch }));

  /** Moves the visible part of the photo by a fraction of the crop's size. */
  function pan(dxCrop: number, dyCrop: number) {
    setDraft((d) => {
      const crop = cropRect(d, dims);
      return { ...d, x: clamp01(d.x + dxCrop * crop.width), y: clamp01(d.y + dyCrop * crop.height) };
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    // Key steps are fractions of the whole photo, so they feel the same at any zoom.
    setDraft((d) => ({ ...d, x: clamp01(d.x + move[0]), y: clamp01(d.y + move[1]) }));
  }

  function onPointerMove(e: React.PointerEvent) {
    const start = dragRef.current;
    const box = photoBoxRef.current?.querySelector("[data-testid='edited-photo-image']")?.parentElement;
    if (!start || !box) return;
    const rect = box.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Dragging the photo right shows more of its left side.
    pan(-(e.clientX - start.x) / rect.width, -(e.clientY - start.y) / rect.height);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }

  async function save() {
    setSaving(true);
    setError(null);
    const failure = await onSave(isDefaultEdit(draft) ? null : draft);
    setSaving(false);
    if (failure) setError(failure);
  }

  const layout = frameLayout(draft, dims);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        if (saving) e.preventDefault();
      }}
      aria-labelledby={`${id}-heading`}
      className="w-[min(100vw-2rem,48rem)] rounded-2xl border border-paper-300 bg-paper-50 p-0 text-ink-900 shadow-2xl backdrop:bg-ink-900/50"
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="border-b border-paper-300 px-5 py-4 sm:px-6">
          <h2 id={`${id}-heading`} className="truncate font-serif text-xl font-bold">
            Edit {label}
          </h2>
        </div>

        <div className="grid gap-5 overflow-y-auto px-5 py-4 sm:grid-cols-[1fr_15rem] sm:px-6">
          <div>
            <div
              ref={photoBoxRef}
              role="group"
              aria-label="Photo position"
              aria-describedby={`${id}-position-hint`}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onPointerDown={(e) => {
                dragRef.current = { x: e.clientX, y: e.clientY };
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }}
              onPointerMove={onPointerMove}
              onPointerUp={() => (dragRef.current = null)}
              onPointerCancel={() => (dragRef.current = null)}
              className="mx-auto max-w-sm cursor-grab touch-none rounded-lg bg-paper-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-vermilion-500 active:cursor-grabbing"
              style={{ maxWidth: `min(24rem, ${Math.round(layout.aspect * 60)}vh)` }}
            >
              <EditedPhoto src={src} alt={`Preview of ${label}`} edit={draft} dims={dims} sizes="384px" blurDataUrl={blurDataUrl} />
            </div>
            <p id={`${id}-position-hint`} className="mt-2 text-center text-xs text-ink-500">
              Drag the photo, or use the arrow keys, to move it in the frame.
            </p>
          </div>

          <div className="space-y-4 text-sm">
            <fieldset>
              <legend className="font-mono text-xs uppercase tracking-wider text-ink-700">Ratio</legend>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {PHOTO_RATIOS.map((r) => (
                  <label key={r.value} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-paper-300 bg-white px-2 py-1.5 has-[:checked]:border-ink-900">
                    <input
                      type="radio"
                      name={`${id}-ratio`}
                      value={r.value}
                      checked={draft.ratio === r.value}
                      onChange={() => update({ ratio: r.value })}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor={`${id}-zoom`} className="font-mono text-xs uppercase tracking-wider text-ink-700">
                Zoom
              </label>
              <input
                id={`${id}-zoom`}
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.05}
                value={draft.zoom}
                aria-valuetext={`${Math.round(draft.zoom * 100)}%`}
                onChange={(e) => update({ zoom: Number(e.target.value) })}
                className="mt-2 w-full accent-ink-900"
              />
            </div>

            <fieldset>
              <legend className="font-mono text-xs uppercase tracking-wider text-ink-700">Frame</legend>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {PHOTO_FRAMES.map((f) => (
                  <label key={f.value} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-paper-300 bg-white px-2 py-1.5 has-[:checked]:border-ink-900">
                    <input
                      type="radio"
                      name={`${id}-frame`}
                      value={f.value}
                      checked={draft.frame === f.value}
                      onChange={() => update({ frame: f.value })}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-mono text-xs uppercase tracking-wider text-ink-700">Card size on the board</legend>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {CARD_SIZES.map((c) => (
                  <label key={c.value} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-paper-300 bg-white px-2 py-1.5 has-[:checked]:border-ink-900">
                    <input
                      type="radio"
                      name={`${id}-card`}
                      value={c.value}
                      checked={draft.cardSize === c.value}
                      onChange={() => update({ cardSize: c.value })}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        {usedIn.length > 0 ? (
          <p className="mx-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:mx-6">
            This photo is used in {quoteList(usedIn)}. Saving changes it there too, including published zines.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mx-5 mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 sm:mx-6">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-paper-300 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_EDIT)}
            className="text-sm font-medium text-ink-700 underline underline-offset-2"
          >
            Reset
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm font-medium text-ink-700 hover:bg-paper-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              aria-busy={saving}
              className="rounded-xl bg-ink-900 px-5 py-2 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
