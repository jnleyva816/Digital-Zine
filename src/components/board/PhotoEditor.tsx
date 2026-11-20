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
  type PhotoFrame,
} from "@/lib/photo-edit";
import { quoteList } from "./board-utils";

/** How far one arrow-key press moves the photo, as a fraction of its width or height. */
const KEY_STEP = 0.02;

/** "4:5" as 0.8. Only for the fixed ratios, not "original". */
function ratioAspect(value: string): number {
  const [w, h] = value.split(":").map(Number);
  return w / h;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** The longest side of a ratio's little outline, in px. */
const SHAPE_SIZE = 24;

/** A small outline at the ratio's shape, so creators see it instead of reading it (DIG-48). */
function RatioShape({ aspect, value }: { aspect: number; value: string }) {
  const width = aspect >= 1 ? SHAPE_SIZE : SHAPE_SIZE * aspect;
  const height = aspect >= 1 ? SHAPE_SIZE / aspect : SHAPE_SIZE;
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden="true">
      <div data-ratio-shape={value} className="rounded-[3px] border-2 border-ink-700" style={{ width: `${width}px`, height: `${height}px` }} />
    </div>
  );
}

const SWATCH_FRAMES: Record<PhotoFrame, string> = {
  none: "",
  "thin-white": "bg-white p-[1.5px] shadow-sm ring-1 ring-paper-300",
  "white-mat": "bg-white p-[5px] shadow-sm ring-1 ring-paper-300",
  black: "bg-ink-900 p-[3px]",
  polaroid: "bg-white p-[3px] pb-[9px] shadow ring-1 ring-paper-300",
};

/** A small picture with the frame around it, so creators see the frame instead of reading its name. */
function FrameSwatch({ frame }: { frame: PhotoFrame }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden="true">
      <div data-frame-swatch={frame} className={`box-border h-[26px] w-[26px] ${SWATCH_FRAMES[frame]}`}>
        <div className="h-full w-full bg-gradient-to-br from-paper-300 to-vermilion-500" />
      </div>
    </div>
  );
}

/**
 * One choice among several. The radio input lies invisibly over the whole tile, so the tile is
 * the tap target (at least 44 px tall) and the input is still what keyboards and screen readers
 * find. The preview, if any, is decoration; the label is the name.
 */
function OptionTile({
  name,
  value,
  checked,
  onChange,
  label,
  preview,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  preview?: React.ReactNode;
}) {
  return (
    <label className="relative flex min-h-12 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-xl border border-paper-300 bg-white px-3 py-2 text-sm transition has-[:checked]:border-ink-900 has-[:checked]:bg-paper-100 has-[:checked]:ring-1 has-[:checked]:ring-ink-900 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-vermilion-500">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {preview}
      <span>{label}</span>
    </label>
  );
}

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
  const originalAspect = dims && dims.height > 0 ? dims.width / dims.height : 3 / 2;
  const tiles = "mt-2 grid gap-2";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        if (saving) e.preventDefault();
      }}
      aria-labelledby={`${id}-heading`}
      className="m-auto max-h-[calc(100dvh-1rem)] w-[min(100vw-1rem,62rem)] max-w-none overflow-hidden rounded-2xl border border-paper-300 bg-paper-50 p-0 text-ink-900 shadow-2xl backdrop:bg-ink-900/50"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] flex-col">
        <div className="shrink-0 border-b border-paper-300 px-5 py-4 sm:px-6">
          <h2 id={`${id}-heading`} className="truncate font-serif text-xl font-bold">
            Edit {label}
          </h2>
        </div>

        {/* Only this part scrolls. On a phone the photo stays pinned at its top while the controls pass beneath. */}
        <div data-editor-scroll className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
          <div className="sticky top-0 z-10 -mx-5 bg-paper-50 px-5 pb-3 pt-3 shadow-[0_10px_10px_-10px_rgba(0,0,0,0.25)] sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:py-4 lg:shadow-none">
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
              className="mx-auto max-w-[min(24rem,calc(var(--aspect)*34dvh))] cursor-grab touch-none rounded-lg bg-paper-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-vermilion-500 active:cursor-grabbing lg:max-w-[min(34rem,calc(var(--aspect)*58dvh))]"
              style={{ "--aspect": layout.aspect } as React.CSSProperties}
            >
              <EditedPhoto src={src} alt={`Preview of ${label}`} edit={draft} dims={dims} sizes="544px" blurDataUrl={blurDataUrl} />
            </div>
            <p id={`${id}-position-hint`} className="mt-2 text-center text-xs text-ink-500">
              Drag the photo, or use the arrow keys, to move it in the frame.
            </p>
          </div>

          <div className="space-y-6 pb-5 pt-2 text-sm lg:py-4">
            <fieldset>
              <legend className="font-mono text-xs uppercase tracking-wider text-ink-700">Ratio</legend>
              <div className={`${tiles} grid-cols-2 min-[420px]:grid-cols-3 lg:grid-cols-2`}>
                {PHOTO_RATIOS.map((r) => (
                  <OptionTile
                    key={r.value}
                    name={`${id}-ratio`}
                    value={r.value}
                    label={r.label}
                    checked={draft.ratio === r.value}
                    onChange={() => update({ ratio: r.value })}
                    preview={<RatioShape value={r.value} aspect={r.value === "original" ? originalAspect : ratioAspect(r.value)} />}
                  />
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
                className="mt-1 block h-11 w-full accent-ink-900"
              />
            </div>

            <fieldset>
              <legend className="font-mono text-xs uppercase tracking-wider text-ink-700">Frame</legend>
              <div className={`${tiles} grid-cols-2`}>
                {PHOTO_FRAMES.map((f) => (
                  <OptionTile
                    key={f.value}
                    name={`${id}-frame`}
                    value={f.value}
                    label={f.label}
                    checked={draft.frame === f.value}
                    onChange={() => update({ frame: f.value })}
                    preview={<FrameSwatch frame={f.value} />}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-mono text-xs uppercase tracking-wider text-ink-700">Card size on the board</legend>
              <div className={`${tiles} grid-cols-2`}>
                {CARD_SIZES.map((c) => (
                  <OptionTile
                    key={c.value}
                    name={`${id}-card`}
                    value={c.value}
                    label={c.label}
                    checked={draft.cardSize === c.value}
                    onChange={() => update({ cardSize: c.value })}
                  />
                ))}
              </div>
            </fieldset>

            {usedIn.length > 0 ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                This photo is used in {quoteList(usedIn)}. Saving changes it there too, including published zines.
              </p>
            ) : null}
          </div>
        </div>

        {error ? (
          <p role="alert" className="mx-5 mt-3 shrink-0 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 sm:mx-6">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-paper-300 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_EDIT)}
            className="min-h-11 rounded-lg px-2 text-sm font-medium text-ink-700 underline underline-offset-2"
          >
            Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={saving}
              className="min-h-11 rounded-xl px-4 text-sm font-medium text-ink-700 hover:bg-paper-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              aria-busy={saving}
              className="min-h-11 rounded-xl bg-ink-900 px-6 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
