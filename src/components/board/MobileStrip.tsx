"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { EditedPhoto } from "@/components/EditedPhoto";
import { prefersReducedMotion } from "@/lib/board/board-transition";
import { photoDay, stripLayout } from "@/lib/board/strip";
import { assetLabel } from "./board-utils";
import type { BoardAsset } from "./types";

const PAD = 20;
const GAP = 12;
/** A thumbnail's place, wide enough to tap. */
const THUMB = 44;
/** What the next photo shows of itself, with the gap beside it. */
const PEEK = 70;

export interface MobileStripLook {
  style: CSSProperties;
  photo: { width: number; height: number };
  near: boolean;
}

interface MobileStripProps {
  assets: BoardAsset[];
  total: number;
  /** The photo to open at. */
  startAt: string | null;
  /** Photos that stay drawn: the one picked up from the keyboard, and the one being dragged. */
  keepIds: (string | null)[];
  listRef: Ref<HTMLOListElement>;
  loadError: string | null;
  onRetryLoad: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  renderCard: (asset: BoardAsset, index: number, look: MobileStripLook) => ReactNode;
}

const two = (n: number) => String(n).padStart(2, "0");

/** The strip on a phone: one photo at a time, the next one peeking in (DIG-93). */
export function MobileStrip({ assets, total, startAt, keepIds, listRef, loadError, onRetryLoad, onDragOver, onDrop, renderCard }: MobileStripProps) {
  const row = useRef<HTMLDivElement>(null);
  const thumbRow = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 360, screen: 640 });
  const [at, setAt] = useState(0);
  const [thumbs, setThumbs] = useState<[number, number]>([0, 30]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  /** Where a smooth scroll is going, so quick presses add up. */
  const heading = useRef<number | null>(null);

  const boxHeight = Math.max(150, Math.min((size.width - PAD - PEEK) * 1.25, size.screen * 0.44));
  const photo = { width: Math.round(boxHeight * 0.8), height: Math.round(boxHeight) };
  const pitch = photo.width + GAP;
  const day = stripLayout(assets.map((a) => ({ day: photoDay(a.exif?.takenAt), width: 1 }))).cards.slice(0, at + 1).findLast((c) => c.heading)?.heading;

  useLayoutEffect(() => {
    const measure = () => {
      const next = { width: row.current?.clientWidth || 360, screen: window.innerHeight };
      // A phone's address bar comes and goes as the page scrolls; only a new width or a real turn counts.
      setSize((s) => (s.width === next.width && Math.abs(s.screen - next.screen) < 150 ? s : next));
    };
    setSize({ width: row.current?.clientWidth || 360, screen: window.innerHeight });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const read = useCallback(() => {
    if (row.current) setAt(Math.min(Math.max(Math.round(row.current.scrollLeft / pitch), 0), Math.max(0, assets.length - 1)));
  }, [pitch, assets.length]);
  useLayoutEffect(read, [read]);

  // Opens at the photo the other view was on, once its size is known.
  const placed = useRef<number | null>(null);
  const shown = useRef(0);
  shown.current = at;
  useLayoutEffect(() => {
    const el = row.current;
    if (!el || placed.current === pitch) return;
    const index = placed.current === null ? assets.findIndex((a) => a.id === startAt) : shown.current;
    placed.current = pitch;
    if (index > 0) el.scrollLeft = index * pitch;
    read();
  }, [pitch, assets, startAt, read]);

  const readThumbs = useCallback(() => {
    const el = thumbRow.current;
    if (!el) return;
    const first = Math.max(0, Math.floor(el.scrollLeft / THUMB) - 8);
    const last = Math.ceil((el.scrollLeft + el.clientWidth) / THUMB) + 8;
    setThumbs((t) => (t[0] === first && t[1] === last ? t : [first, last]));
  }, []);
  useLayoutEffect(readThumbs, [readThumbs, size]);
  useEffect(() => {
    const el = thumbRow.current;
    el?.scrollTo?.({ left: Math.max(0, at * THUMB + THUMB / 2 + PAD - el.clientWidth / 2) });
  }, [at]);

  function goTo(index: number) {
    const to = Math.min(Math.max(index, 0), assets.length - 1);
    heading.current = to === at ? null : to;
    row.current?.scrollTo?.({ left: to * pitch, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function onKeyDown(e: KeyboardEvent) {
    // A held photo has taken its keys already.
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).matches("input, textarea, select")) return;
    const from = heading.current ?? at;
    const next = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: assets.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    goTo(next);
  }

  const reach = Math.ceil(size.width / pitch) + 1;
  const settle = () => (heading.current = null);

  return (
    <div className="flex min-h-[calc(100dvh-13.5rem)] flex-col gap-3 overflow-hidden bg-[#1B1917] pb-4 pt-4 text-paper-50">
      <div className="flex justify-between px-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#D9CFBE]">
        <h2>{day}</h2>
        <p>{`${two(at + 1)} / ${two(total)}`}</p>
      </div>
      <div
        ref={row}
        data-scroller=""
        role="region"
        aria-label="Photo strip"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={read}
        onScrollEnd={settle}
        onTouchStart={settle}
        onWheel={settle}
        onFocus={(e) => setFocusedId((e.target as HTMLElement).closest("li")?.dataset.assetId ?? null)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusedId(null);
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="overflow-x-auto overflow-y-hidden scroll-pl-[20px] [scroll-snap-type:x_mandatory] scrollbar-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vermilion-500"
      >
        {/* The last photo can come to the left edge too. */}
        <ol ref={listRef} aria-label="Vision Board photos" className="relative" style={{ width: assets.length * pitch + Math.max(0, size.width - pitch), height: photo.height + 100 }}>
          {assets.map((asset, i) =>
            renderCard(asset, i, {
              style: { position: "absolute", top: 2, left: PAD + i * pitch, width: photo.width },
              photo,
              near: Math.abs(i - at) <= reach || asset.id === focusedId || keepIds.includes(asset.id),
            })
          )}
        </ol>
      </div>
      <div ref={thumbRow} role="group" aria-label="All photos" onScroll={readThumbs} className="overflow-x-auto scrollbar-none">
        <div className="relative h-[52px]" style={{ width: assets.length * THUMB + PAD * 2 }}>
          {assets.slice(thumbs[0], thumbs[1]).map((asset, n) => {
            const i = thumbs[0] + n;
            return (
              <button
                key={asset.id}
                type="button"
                aria-label={`Go to photo ${i + 1}, ${assetLabel(asset, i)}`}
                aria-current={i === at ? "true" : undefined}
                // One stop for the Tab key; the arrow keys move the row.
                tabIndex={i === at ? 0 : -1}
                onClick={() => goTo(i)}
                style={{ left: PAD + i * THUMB }}
                className="absolute top-0 flex h-[52px] w-11 items-center justify-center rounded-xs focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vermilion-500"
              >
                <span className={`block h-[42px] w-[34px] overflow-hidden rounded-xs bg-ink-900 ${i === at ? "outline-solid outline-2 outline-paper-50" : "opacity-45"}`}>
                  {asset.status === "ready" ? <EditedPhoto as="span" src={asset.publicUrl} alt="" edit={null} dims={asset.width && asset.height ? { width: asset.width, height: asset.height } : null} sizes="34px" blurDataUrl={asset.blurDataUrl} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {loadError ? (
        <p role="alert" className="px-5 text-xs">
          {loadError}{" "}
          <button type="button" onClick={onRetryLoad} className="min-h-11 px-2 underline underline-offset-2">
            Try again
          </button>
        </p>
      ) : (
        <p className="px-5 text-xs text-[#CFC7BC]">Swipe sideways through the board in order. Long-press a photo to move it.</p>
      )}
    </div>
  );
}
