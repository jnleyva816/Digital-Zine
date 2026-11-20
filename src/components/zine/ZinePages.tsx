"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { FlipCard } from "@/components/FlipCard";
import { pageHash, parsePageHash } from "@/lib/lightbox-hash";
import { withViewTransition } from "@/lib/view-transition";
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

  return (
    <>
      <ol aria-label="Pages" className="space-y-8 sm:space-y-12">
        {pages.map((page, i) => (
          <li key={page.pageNumber}>
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
              priority={i === 0}
              onOpenFullScreen={(card) => open(page.pageNumber, card)}
            />
          </li>
        ))}
      </ol>
      <PhotoLightbox pages={pages} current={openPage} onNavigate={navigate} onClose={close} />
    </>
  );
}
