"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { EditedPhoto } from "@/components/EditedPhoto";
import { DOUBLE_TAP_ZOOM, clampOffset, isDoubleTap, pinchTo, swipeDirection, zoomAt, type Offset, type Tap } from "@/lib/pan-zoom";
import { DEFAULT_EDIT, frameLayout } from "@/lib/photo-edit";
import type { ZinePageData } from "./types";

interface Zoom {
  scale: number;
  offset: Offset;
}
const UNZOOMED: Zoom = { scale: 1, offset: { x: 0, y: 0 } };
/** A touch that moves less than this is a tap, not a drag. */
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 400;

type Pointer = { x: number; y: number };
type Gesture =
  | { kind: "none" }
  | { kind: "swipe"; startX: number; startY: number; startTime: number }
  | { kind: "pan"; startX: number; startY: number; startOffset: Offset; startTime: number }
  | { kind: "pinch"; startDistance: number; startScale: number; startOffset: Offset; startCenter: Offset };

interface PhotoLightboxProps {
  pages: ZinePageData[];
  /** The page number on show, or null when closed. */
  current: number | null;
  onNavigate: (page: number) => void;
  onClose: () => void;
}

/**
 * A page's photo full screen (DIG-49): its crop and frame on a dark background, with next and
 * previous (buttons, arrow keys, swipes), a counter, zoom (pinch, double-tap, or a button), and
 * close (button, Escape, or swipe down). A native modal `<dialog>`, so focus stays inside it.
 */
export function PhotoLightbox({ pages, current, onNavigate, onClose }: PhotoLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef<Gesture>({ kind: "none" });
  const lastTap = useRef<Tap | null>(null);
  const [zoom, setZoom] = useState<Zoom>(UNZOOMED);

  const index = current === null ? -1 : pages.findIndex((p) => p.pageNumber === current);
  const page = index >= 0 ? pages[index] : null;
  const total = pages.length;

  // Open and close the native dialog with the state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (page) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [page]);

  // Every photo starts unzoomed.
  useEffect(() => {
    setZoom(UNZOOMED);
    pointers.current.clear();
    gesture.current = { kind: "none" };
    lastTap.current = null;
  }, [current]);

  const goTo = (offset: number) => {
    const next = pages[index + offset];
    if (next) onNavigate(next.pageNumber);
  };

  // Keys. They go to the document, because focus is wherever the reader last put it inside the dialog.
  useEffect(() => {
    if (!page) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(-1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // goTo changes with the page; re-bind when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, index, pages]);

  const frame = () => ({ width: fitRef.current?.offsetWidth ?? 0, height: fitRef.current?.offsetHeight ?? 0 });
  /** A pointer's position in px from the middle of the photo's frame. */
  const fromCentre = (p: Pointer): Offset => {
    const r = fitRef.current?.getBoundingClientRect();
    return r ? { x: p.x - (r.left + r.width / 2), y: p.y - (r.top + r.height / 2) } : { x: 0, y: 0 };
  };

  function toggleZoom(at: Offset) {
    setZoom((z) => zoomAt(at, z, z.scale > 1 ? 1 : DOUBLE_TAP_ZOOM, frame()));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stageRef.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const ca = fromCentre(a);
      const cb = fromCentre(b);
      gesture.current = {
        kind: "pinch",
        startDistance: Math.hypot(a.x - b.x, a.y - b.y),
        startScale: zoom.scale,
        startOffset: zoom.offset,
        startCenter: { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 },
      };
    } else if (pointers.current.size === 1) {
      gesture.current =
        zoom.scale > 1
          ? { kind: "pan", startX: e.clientX, startY: e.clientY, startOffset: zoom.offset, startTime: e.timeStamp }
          : { kind: "swipe", startX: e.clientX, startY: e.clientY, startTime: e.timeStamp };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const ca = fromCentre(a);
      const cb = fromCentre(b);
      setZoom(
        pinchTo({
          startScale: g.startScale,
          startDistance: g.startDistance,
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          startOffset: g.startOffset,
          startCenter: g.startCenter,
          center: { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 },
          frame: frame(),
        })
      );
    } else if (g.kind === "pan") {
      const offset = clampOffset(zoom.scale, frame(), { x: g.startOffset.x + e.clientX - g.startX, y: g.startOffset.y + e.clientY - g.startY });
      setZoom((z) => ({ ...z, offset }));
    }
  }

  function endPointer(e: React.PointerEvent, cancelled: boolean) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    stageRef.current?.releasePointerCapture?.(e.pointerId);
    const g = gesture.current;
    if (g.kind === "pinch") {
      // A pinch ends with the first finger up. The finger left is not a new gesture.
      if (pointers.current.size < 2) gesture.current = { kind: "none" };
      return;
    }
    if (g.kind === "none" || cancelled) {
      gesture.current = { kind: "none" };
      return;
    }
    gesture.current = { kind: "none" };

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const moved = Math.hypot(dx, dy);
    if (moved <= TAP_SLOP_PX && e.timeStamp - g.startTime <= TAP_MAX_MS) {
      const tap: Tap = { time: e.timeStamp, x: e.clientX, y: e.clientY };
      if (isDoubleTap(lastTap.current, tap)) {
        lastTap.current = null;
        toggleZoom(fromCentre({ x: e.clientX, y: e.clientY }));
      } else {
        lastTap.current = tap;
      }
      return;
    }
    if (g.kind === "swipe") {
      const direction = swipeDirection(dx, dy);
      if (direction === "next") goTo(1);
      else if (direction === "prev") goTo(-1);
      else if (direction === "close") onClose();
    }
  }

  const aspect = page ? frameLayout(page.edit ?? DEFAULT_EDIT, page.dims ?? null).aspect : 1;
  const label = page ? `${page.name || "Photo"}, page ${page.pageNumber} of ${total}` : "Photo";
  const zoomed = zoom.scale > 1;
  const button =
    "inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-paper-50 backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500 disabled:opacity-30 disabled:hover:bg-white/10";

  return (
    <dialog
      ref={dialogRef}
      data-lightbox
      aria-label={label}
      onCancel={(e) => {
        // The browser's own Escape or back gesture: let our close run, so the address bar stays in step.
        e.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden border-0 bg-ink-900 p-0 text-paper-50 backdrop:bg-black"
    >
      {page ? (
        <div className="relative h-full w-full">
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-3 sm:p-4">
            <p aria-live="polite" className="rounded-full bg-black/45 px-3 py-1.5 font-mono text-xs tracking-[0.18em] text-paper-50 backdrop-blur-sm">
              {`${page.pageNumber} / ${total}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={button}
                aria-label={zoomed ? "Zoom out" : "Zoom in"}
                onClick={() => toggleZoom({ x: 0, y: 0 })}
              >
                {zoomed ? <ZoomOut className="h-5 w-5" aria-hidden="true" /> : <ZoomIn className="h-5 w-5" aria-hidden="true" />}
              </button>
              <button type="button" className={button} aria-label="Close full screen view" onClick={onClose}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            ref={stageRef}
            className="absolute inset-0 flex touch-none select-none items-center justify-center px-3 pb-20 pt-16 sm:px-20"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endPointer(e, false)}
            onPointerCancel={(e) => endPointer(e, true)}
          >
            <div
              ref={fitRef}
              style={{ "--aspect": aspect, width: "min(100%, calc(var(--aspect) * (100dvh - 9rem)))" } as CSSProperties}
            >
              <div
                data-testid="lightbox-photo"
                data-zoom={Math.round(zoom.scale * 1000) / 1000}
                className="will-change-transform"
                style={{
                  transform: `translate(${zoom.offset.x}px, ${zoom.offset.y}px) scale(${zoom.scale})`,
                  viewTransitionName: "zine-photo",
                }}
              >
                <EditedPhoto
                  src={page.imageUrl}
                  alt={page.name || page.caption || `Page ${page.pageNumber} of ${total}`}
                  edit={page.edit ?? null}
                  dims={page.dims ?? null}
                  sizes="100vw"
                  blurDataUrl={page.blurDataUrl}
                  priority
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            className={`${button} absolute left-2 top-1/2 z-10 -translate-y-1/2 sm:left-4`}
            aria-label="Previous photo"
            disabled={index <= 0}
            onClick={() => goTo(-1)}
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${button} absolute right-2 top-1/2 z-10 -translate-y-1/2 sm:right-4`}
            aria-label="Next photo"
            disabled={index >= total - 1}
            onClick={() => goTo(1)}
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>

          {page.caption ? (
            <p className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/80 to-transparent px-16 pb-4 pt-10 text-center font-serif text-sm leading-relaxed text-paper-50 sm:text-base">
              {page.caption}
            </p>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
