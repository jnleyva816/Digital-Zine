/** Masonry layout (DIG-90): positions only, so the page keeps the board's order for screen readers and drag. */
export const MASONRY_GAP = 16;
const COLUMN_WIDTH = 220;

/** How many columns of about 220 px fit; phones get two. */
export function masonryColumns(width: number): number {
  return Math.max(2, Math.floor((width + MASONRY_GAP) / (COLUMN_WIDTH + MASONRY_GAP)));
}

export interface MasonrySpot {
  left: number;
  top: number;
  width: number;
}

/** Puts each card, in order, where it can sit highest; the leftmost place wins a tie. */
export function packMasonry(
  items: { height: number; span: number }[],
  { width, columns, gap = MASONRY_GAP }: { width: number; columns: number; gap?: number }
): { cards: MasonrySpot[]; height: number } {
  const column = (width - gap * (columns - 1)) / columns;
  const bottoms = new Array<number>(columns).fill(0);
  const cards = items.map(({ height, span: wanted }) => {
    const span = Math.min(wanted, columns);
    let at = 0;
    let top = Infinity;
    for (let c = 0; c + span <= columns; c++) {
      const free = Math.max(...bottoms.slice(c, c + span));
      if (free < top) {
        at = c;
        top = free;
      }
    }
    bottoms.fill(top + height + gap, at, at + span);
    return { left: at * (column + gap), top, width: column * span + gap * (span - 1) };
  });
  return { cards, height: items.length === 0 ? 0 : Math.max(...bottoms) - gap };
}
