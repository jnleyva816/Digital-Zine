"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { swipeDirection } from "@/lib/board/pan-zoom";
import { DEFAULT_EDIT, frameLayout } from "@/lib/board/photo-edit";
import { bookSpreads, spreadIndexOf, spreadLabel } from "@/lib/zine/reading-view";
import type { ZinePageData } from "./types";

const WIDE_SCREEN = "(min-width: 1024px)";
/** Room for the header, the mode toggle, and the page controls, so a whole page fits on screen. */
const CHROME_HEIGHT = "13rem";

interface BookReaderProps {
  pages: ZinePageData[];
  /** The page the reader is on. A spread is found from it, so resizing keeps their place. */
  current: number;
  onTurn: (page: number) => void;
  /** Off while a photo is full screen: the arrow keys belong to it. */
  keysEnabled: boolean;
  renderPage: (page: ZinePageData, isCurrent: boolean) => ReactNode;
}

/** A zine as a book (DIG-50): one page at a time, or a cover and then facing pages on a wide screen. */
export function BookReader({ pages, current, onTurn, keysEnabled, renderPage }: BookReaderProps) {
  const total = pages.length;
  const [perSpread, setPerSpread] = useState<1 | 2>(() => (matchMedia(WIDE_SCREEN).matches ? 2 : 1));
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swallowClick = useRef(false);

  useEffect(() => {
    const query = matchMedia(WIDE_SCREEN);
    const update = () => setPerSpread(query.matches ? 2 : 1);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const spreads = bookSpreads(total, perSpread);
  const index = spreadIndexOf(spreads, current);
  const spread = spreads[index] ?? [];
  const lastShown = spread[spread.length - 1] ?? 0;

  function goTo(target: number) {
    if (target < 0 || target >= spreads.length || target === index) return;
    setDirection(target > index ? "next" : "prev");
    onTurn(spreads[target][0]);
  }

  // Always the latest closure, without re-adding the listener on every turn.
  const goToRef = useRef(goTo);
  const placeRef = useRef({ index, last: spreads.length - 1 });
  useEffect(() => {
    goToRef.current = goTo;
    placeRef.current = { index, last: spreads.length - 1 };
  });

  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable=true], dialog")) return;
      const { index: at, last } = placeRef.current;
      const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: last }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      goToRef.current(to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysEnabled]);

  const turnButton =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-paper-300 bg-white text-ink-900 shadow-xs transition hover:bg-paper-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500 disabled:opacity-40";
  // Over the photo but under the card's own buttons (z-10). The named buttons below do the same for keyboards and screen readers.
  const edge = "absolute inset-y-0 z-5 w-[12%] max-w-16 cursor-pointer";

  return (
    <section aria-label="Book" className="lg:mx-[calc(50%-min(50vw-1.5rem,38rem))]">
      <div
        className="relative touch-pan-y touch-pinch-zoom"
        onPointerDown={(e) => {
          swallowClick.current = false;
          swipe.current = e.isPrimary && e.pointerType !== "mouse" ? { x: e.clientX, y: e.clientY } : null;
        }}
        onPointerCancel={() => (swipe.current = null)}
        onPointerUp={(e) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start) return;
          const turned = swipeDirection(e.clientX - start.x, e.clientY - start.y);
          if (turned !== "next" && turned !== "prev") return;
          swallowClick.current = true;
          goTo(index + (turned === "next" ? 1 : -1));
        }}
        onClickCapture={(e) => {
          // A swipe that ends on a card must not also flip it.
          if (!swallowClick.current) return;
          swallowClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {/* The neighbours are mounted, hidden, so their photos are loaded before the reader turns to them. */}
        {spreads.map((numbers, i) => {
          if (Math.abs(i - index) > 1) return null;
          const isCurrent = i === index;
          return (
            <div
              key={numbers[0]}
              data-spread={numbers.join("-")}
              data-turn={isCurrent && direction ? direction : undefined}
              inert={!isCurrent}
              style={isCurrent ? undefined : { visibility: "hidden" }}
              className={`book-spread flex items-center justify-center ${isCurrent ? "relative" : "pointer-events-none absolute inset-0 overflow-hidden"}`}
            >
              {numbers.map((n) => {
                const page = pages[n - 1];
                const aspect = frameLayout(page.edit ?? DEFAULT_EDIT, page.dims ?? null).aspect;
                return (
                  <div
                    key={n}
                    className="min-w-0 flex-1"
                    style={{ maxWidth: `calc((100svh - ${CHROME_HEIGHT}) * ${Math.round(aspect * 1000) / 1000})` } as CSSProperties}
                  >
                    {renderPage(page, isCurrent)}
                  </div>
                );
              })}
            </div>
          );
        })}
        {index > 0 ? <div aria-hidden="true" data-testid="book-edge-previous" className={`${edge} left-0`} onClick={() => goTo(index - 1)} /> : null}
        {index < spreads.length - 1 ? <div aria-hidden="true" data-testid="book-edge-next" className={`${edge} right-0`} onClick={() => goTo(index + 1)} /> : null}
      </div>

      <div className="mt-5 flex items-center justify-center gap-5">
        <button type="button" aria-label="Previous page" disabled={index === 0} onClick={() => goTo(index - 1)} className={turnButton}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <p aria-hidden="true" className="min-w-20 text-center font-mono text-xs tracking-[0.18em] text-ink-700">
          {spread.join("–")} / {total}
        </p>
        <button type="button" aria-label="Next page" disabled={index >= spreads.length - 1} onClick={() => goTo(index + 1)} className={turnButton}>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={lastShown}
        className="mx-auto mt-4 h-0.5 max-w-xs overflow-hidden rounded-full bg-paper-300"
      >
        <div className="h-full bg-vermilion-500 transition-[width] motion-reduce:transition-none" style={{ width: `${total ? (lastShown / total) * 100 : 0}%` }} />
      </div>
      <p role="status" className="sr-only">
        {spreadLabel(spread, total)}
      </p>
    </section>
  );
}
