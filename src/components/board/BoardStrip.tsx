"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { EditedPhoto } from "@/components/EditedPhoto";
import { DEFAULT_EDIT, frameLayout } from "@/lib/photo-edit";
import { inView, photoDay, stripLayout } from "@/lib/strip";
import { assetLabel } from "./board-utils";
import type { BoardAsset } from "./types";

/** The row's side padding. */
const PAD = 28;
const PHOTO_HEIGHT = 440;
/** What stands above and below the photo: the day, the caption, and the padding. */
const AROUND = 150;
/** A scrubber thumbnail and its gap. */
const THUMB = 34;
/** Text fields keep their own arrow keys. */
const TYPING = "input, textarea, select";

export interface StripCardLook {
  style: CSSProperties;
  heading: string | null;
  /** Far-off cards are drawn as an empty, named place. */
  near: boolean;
}

interface BoardStripProps {
  assets: BoardAsset[];
  total: number;
  /** The photo to open at. */
  startAt: string | null;
  heldId: string | null;
  keysHintId: string;
  loadError: string | null;
  onRetryLoad: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  renderCard: (asset: BoardAsset, index: number, look: StripCardLook) => ReactNode;
}

const dimsOf = (a: BoardAsset) => (a.width && a.height ? { width: a.width, height: a.height } : null);
const smooth = () => (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/** Every photo in board order, in one long row like a light table (DIG-91). */
export function BoardStrip({ assets, total, startAt, heldId, keysHintId, loadError, onRetryLoad, onDragOver, onDrop, renderCard }: BoardStripProps) {
  const row = useRef<HTMLDivElement>(null);
  const scrubber = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, scrubber: 0 });
  const [scroll, setScroll] = useState({ near: [0, 7] as [number, number], view: [0, 0] as [number, number] });
  const [thumbs, setThumbs] = useState<[number, number]>([0, 50]);
  /** The photo holding keyboard focus stays drawn wherever it is. */
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusNext = useRef<string | null>(null);
  /** Where a smooth scroll is going, so quick presses add up. */
  const heading = useRef<number | null>(null);

  const photoHeight = Math.max(160, Math.min(PHOTO_HEIGHT, size.height - AROUND || PHOTO_HEIGHT, (size.width - PAD * 2) * 1.25));
  const { cards, width } = useMemo(
    () => stripLayout(assets.map((a) => ({ day: photoDay(a.exif?.takenAt), width: Math.round(photoHeight * frameLayout(a.edit ?? DEFAULT_EDIT, dimsOf(a)).aspect) }))),
    [assets, photoHeight]
  );

  const read = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const left = el.scrollLeft - PAD;
    const view = inView(cards, left, el.clientWidth);
    const far = el.clientWidth;
    let first = view[0];
    let last = view[1];
    while (first > 0 && cards[first - 1].left + cards[first - 1].width > left - far) first--;
    while (last + 1 < cards.length && cards[last + 1].left < left + el.clientWidth + far) last++;
    setScroll((s) => (s.near[0] === first && s.near[1] === last && s.view[0] === view[0] && s.view[1] === view[1] ? s : { near: [first, last], view }));
  }, [cards]);

  const readThumbs = useCallback(() => {
    const el = scrubber.current;
    if (!el) return;
    const first = Math.max(0, Math.floor(el.scrollLeft / THUMB) - 10);
    const last = Math.ceil((el.scrollLeft + el.clientWidth) / THUMB) + 10;
    setThumbs((t) => (t[0] === first && t[1] === last ? t : [first, last]));
  }, []);

  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight, scrubber: scrubber.current?.clientWidth ?? 0 };
      setSize((s) => (s.width === next.width && s.height === next.height && s.scrubber === next.scrubber ? s : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (scrubber.current) observer.observe(scrubber.current);
    return () => observer.disconnect();
  }, []);

  // Before the first read, so the photos drawn are the ones beside it.
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current || size.width === 0) return;
    started.current = true;
    const card = cards[assets.findIndex((a) => a.id === startAt)];
    if (card && row.current) row.current.scrollLeft = card.left;
  }, [size, cards, assets, startAt]);

  useLayoutEffect(read, [read, size]);
  useLayoutEffect(readThumbs, [readThumbs, size, total]);

  // The scrubber follows the row.
  useEffect(() => {
    const el = scrubber.current;
    if (!el) return;
    const middle = ((scroll.view[0] + scroll.view[1] + 1) / 2) * THUMB;
    el.scrollTo?.({ left: Math.max(0, middle - el.clientWidth / 2) });
  }, [scroll.view]);

  // Focus moves once the photo it goes to is drawn.
  useEffect(() => {
    if (!focusNext.current) return;
    const card = row.current?.querySelector<HTMLElement>(`[data-asset-id="${CSS.escape(focusNext.current)}"] [data-reorder]`);
    focusNext.current = null;
    card?.focus({ preventScroll: true });
  }, [focusedId]);

  function goTo(index: number) {
    const el = row.current;
    const card = cards[index];
    if (!el || !card) return;
    const end = Math.max(0, width + PAD * 2 - el.clientWidth);
    const left = Math.min(card.left, end);
    // At the far end the row cannot bring the photo to the left edge, so the view decides from there.
    heading.current = left < end && left !== el.scrollLeft ? index : null;
    el.scrollTo({ left, behavior: smooth() });
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || target.matches(TYPING)) return;
    const onPhoto = target.matches("[data-reorder]") ? assets.findIndex((a) => a.id === target.closest("li")?.dataset.assetId) : -1;
    const at = onPhoto >= 0 ? onPhoto : (heading.current ?? scroll.view[0]);
    const next = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: assets.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const to = Math.min(Math.max(next, 0), assets.length - 1);
    goTo(to);
    if (onPhoto >= 0 && to !== onPhoto) {
      focusNext.current = assets[to].id;
      setFocusedId(assets[to].id);
    }
  }

  const [first, last] = scroll.view;
  const settle = () => (heading.current = null);

  return (
    <div className="flex h-[calc(100dvh-7.6rem)] min-h-[420px] flex-col bg-[#1B1917] text-paper-50" onKeyDown={onKeyDown}>
      <div
        ref={row}
        role="region"
        aria-label="Photo strip"
        tabIndex={0}
        onScroll={read}
        onScrollEnd={settle}
        onWheel={settle}
        onPointerDown={settle}
        onFocus={(e) => setFocusedId((e.target as HTMLElement).closest("li")?.dataset.assetId ?? null)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusedId(null);
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto pt-7 scroll-pl-[28px] [scroll-snap-type:x_proximity] focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vermilion-500"
      >
        <ol aria-label="Vision Board photos" aria-describedby={keysHintId} className="relative h-full" style={{ width: width + PAD * 2, minHeight: photoHeight + AROUND - 28 }}>
          {assets.map((asset, i) =>
            renderCard(asset, i, {
              style: { position: "absolute", top: 0, left: cards[i].left + PAD, width: cards[i].width },
              heading: cards[i].heading,
              near: (i >= scroll.near[0] && i <= scroll.near[1]) || asset.id === heldId || asset.id === focusedId,
            })
          )}
        </ol>
      </div>
      <div className="flex shrink-0 items-center gap-3.5 border-t border-paper-50/10 px-4 py-3 sm:px-7">
        <p className="shrink-0 font-mono text-[11px] text-[#CFC7BC]">{`${first + 1}${last > first ? `–${last + 1}` : ""} of ${total.toLocaleString("en-US")}`}</p>
        <div ref={scrubber} role="group" aria-label="All photos" onScroll={readThumbs} className="min-w-0 flex-1 overflow-x-auto py-1">
          <div className="relative h-[38px]" style={{ width: assets.length * THUMB }}>
            {assets.slice(thumbs[0], thumbs[1]).map((asset, n) => {
              const i = thumbs[0] + n;
              const shown = i >= first && i <= last;
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-label={`Go to photo ${i + 1}, ${assetLabel(asset, i)}`}
                  aria-current={shown ? "true" : undefined}
                  // One stop for the Tab key; the arrow keys move the row.
                  tabIndex={i === first ? 0 : -1}
                  onClick={() => goTo(i)}
                  style={{ left: i * THUMB + 2 }}
                  className={`absolute top-0 h-[38px] w-[30px] overflow-hidden rounded-xs bg-ink-900 outline-offset-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-vermilion-500 ${shown ? "outline-solid outline-[1.5px] outline-paper-50" : "opacity-45 hover:opacity-80"}`}
                >
                  {asset.status === "ready" ? (
                    <EditedPhoto as="span" src={asset.publicUrl} alt="" edit={null} dims={dimsOf(asset)} sizes="30px" blurDataUrl={asset.blurDataUrl} />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        {loadError ? (
          <p role="alert" className="shrink-0 text-xs text-paper-50">
            {loadError}{" "}
            <button type="button" onClick={onRetryLoad} className="underline underline-offset-2">
              Try again
            </button>
          </p>
        ) : (
          <p className="hidden shrink-0 text-xs text-[#CFC7BC] lg:block">Scroll sideways, or use ← → keys. Drag a photo to move it in the order.</p>
        )}
      </div>
    </div>
  );
}
