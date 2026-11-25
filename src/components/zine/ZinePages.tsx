"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { BookOpen, GalleryVertical } from "lucide-react";
import { FlipCard } from "@/components/FlipCard";
import { pageHash, parsePageHash } from "@/lib/lightbox-hash";
import { READING_VIEW_KEY, parseReadingView, withReadingView, type ReadingView } from "@/lib/reading-view";
import { withViewTransition } from "@/lib/view-transition";
import { BookReader } from "./BookReader";
import { PhotoLightbox } from "./PhotoLightbox";
import type { ZinePageData } from "./types";

export type { ZinePageData } from "./types";

/**
 * A public zine's pages, and the full-screen view of any photo (DIG-49). The list is rendered on
 * the server like before; this only adds what opens a photo. The page is in the address bar while
 * the view is open (`#page-3`), so a shared link opens that photo and Back closes it.
 */
export function ZinePages({ pages }: { pages: ZinePageData[] }) {
  const total = pages.length;
  const [openPage, setOpenPage] = useState<number | null>(null);
  /** True when opening added a history entry, so closing should step back over it. */
  const pushed = useRef(false);
  const lastViewed = useRef<number | null>(null);
  /** The server always renders the scroll, so a zine reads without JavaScript (DIG-50). */
  const [view, setView] = useState<ReadingView>("scroll");
  const [bookPage, setBookPage] = useState(1);

  // The mode a link asks for, or else the one this reader chose before.
  useEffect(() => {
    let chosen = parseReadingView(new URLSearchParams(location.search).get("view"));
    if (!chosen) {
      try {
        chosen = parseReadingView(localStorage.getItem(READING_VIEW_KEY));
      } catch {
        // Storage is blocked: start with the scroll.
      }
    }
    if (chosen) setView(chosen);
  }, []);

  function chooseView(next: ReadingView) {
    setView(next);
    history.replaceState(history.state, "", withReadingView(location.pathname, location.search, location.hash, next));
    try {
      localStorage.setItem(READING_VIEW_KEY, next);
    } catch {
      // Storage is blocked: the choice lasts for this visit.
    }
  }

  // A shared link, and the Back and Forward buttons.
  useEffect(() => {
    const fromAddress = () => {
      const page = parsePageHash(location.hash, total);
      pushed.current = page !== null && Boolean((history.state as { zineLightbox?: boolean } | null)?.zineLightbox);
      setOpenPage(page);
    };
    fromAddress();
    window.addEventListener("popstate", fromAddress);
    window.addEventListener("hashchange", fromAddress);
    return () => {
      window.removeEventListener("popstate", fromAddress);
      window.removeEventListener("hashchange", fromAddress);
    };
  }, [total]);

  // Closed: land the reader back on the page they ended on.
  useEffect(() => {
    if (openPage !== null) {
      lastViewed.current = openPage;
      return;
    }
    const page = lastViewed.current;
    if (page === null) return;
    lastViewed.current = null;
    setBookPage(page);
    // After the dialog has put focus back on the button it came from.
    const timer = setTimeout(() => {
      const button = document.querySelector<HTMLElement>(`[data-page-expand="${page}"]`);
      button?.focus();
      button?.scrollIntoView?.({ block: "center" });
    }, 0);
    return () => clearTimeout(timer);
  }, [openPage]);

  function open(page: number, card: HTMLElement) {
    withViewTransition({
      from: card.querySelector<HTMLElement>('[data-testid="edited-photo"]'),
      update: () => {
        history.pushState({ zineLightbox: true }, "", pageHash(page));
        pushed.current = true;
        flushSync(() => setOpenPage(page));
      },
    });
  }

  function navigate(page: number) {
    // Moving between photos replaces the entry, so Back leaves the viewer instead of paging backwards.
    history.replaceState(history.state, "", pageHash(page));
    setOpenPage(page);
  }

  function close() {
    setOpenPage(null);
    if (pushed.current) {
      pushed.current = false;
      history.back();
    } else {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  const card = (page: ZinePageData, priority: boolean) => (
    <FlipCard
      pageNumber={page.pageNumber}
      totalPages={total}
      imageUrl={page.imageUrl}
      name={page.name}
      edit={page.edit}
      dims={page.dims}
      blurDataUrl={page.blurDataUrl}
      caption={page.caption || undefined}
      flipEnabled={page.flipEnabled}
      kind={page.kind}
      exif={page.exif}
      recipe={page.recipe}
      priority={priority}
      onOpenFullScreen={(element) => open(page.pageNumber, element)}
    />
  );

  return (
    <>
      <div role="group" aria-label="Reading mode" className="mb-6 flex justify-center">
        <div className="inline-flex rounded-full border border-paper-300 bg-paper-50 p-1">
          {(["scroll", "book"] as const).map((mode) => {
            const Icon = mode === "book" ? BookOpen : GalleryVertical;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => chooseView(mode)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500 ${
                  view === mode ? "bg-ink-900 text-paper-50" : "text-ink-700 hover:text-ink-900"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {mode === "book" ? "Book" : "Scroll"}
              </button>
            );
          })}
        </div>
      </div>
      {view === "book" ? (
        <BookReader
          pages={pages}
          current={bookPage}
          onTurn={setBookPage}
          keysEnabled={openPage === null}
          renderPage={(page, isCurrent) => card(page, isCurrent)}
        />
      ) : (
        <ol aria-label="Pages" data-zine-scroll className="stack-y-8 sm:stack-y-12">
          {pages.map((page, i) => (
            <li key={page.pageNumber} className="snap-center">
              {card(page, i === 0)}
            </li>
          ))}
        </ol>
      )}
      <PhotoLightbox pages={pages} current={openPage} onNavigate={navigate} onClose={close} />
    </>
  );
}
