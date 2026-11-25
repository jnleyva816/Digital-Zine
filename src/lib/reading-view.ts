/** How a reader is reading a zine (DIG-50): scrolling down the pages, or turning them like a book. */
export type ReadingView = "scroll" | "book";

/** Where the reader's choice is remembered, on their own browser only. */
export const READING_VIEW_KEY = "zine-reading-view";

export function parseReadingView(value: string | null | undefined): ReadingView | null {
  return value === "book" || value === "scroll" ? value : null;
}

/** The current address with the mode in it. Scrolling is the default, so it needs no parameter. */
export function withReadingView(pathname: string, search: string, hash: string, view: ReadingView): string {
  const params = new URLSearchParams(search);
  if (view === "book") params.set("view", "book");
  else params.delete("view");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

/**
 * Page numbers grouped as they are seen together: one at a time, or as facing pages with page 1
 * alone as the cover (owner, 25 Nov 2026).
 */
export function bookSpreads(total: number, perSpread: 1 | 2): number[][] {
  const pages = Array.from({ length: total }, (_, i) => i + 1);
  if (perSpread === 1) return pages.map((p) => [p]);
  const spreads: number[][] = pages.length > 0 ? [[1]] : [];
  for (let i = 1; i < pages.length; i += 2) spreads.push(pages.slice(i, i + 2));
  return spreads;
}

export function spreadIndexOf(spreads: number[][], page: number): number {
  return Math.max(0, spreads.findIndex((s) => s.includes(page)));
}

export function spreadLabel(spread: number[], total: number): string {
  return spread.length > 1 ? `Pages ${spread[0]} and ${spread[spread.length - 1]} of ${total}` : `Page ${spread[0]} of ${total}`;
}
