/** The strip's layout (DIG-91): one row in board order, with a heading wherever the day changes. */
const GAP = 16;
/** Between days: the divider runs down the middle. */
export const DAY_GAP = 56;

export interface StripCard {
  left: number;
  width: number;
  /** The day's heading, on the first photo of each group. */
  heading: string | null;
}

/** The date on the camera's clock, as YYYY-MM-DD. The camera was set to the photographer's time, so no zone applies. */
export function photoDay(takenAt: string | null | undefined): string | null {
  const found = /^(\d{4})[:-](\d{2})[:-](\d{2})(?!\d)/.exec(takenAt ?? "");
  if (!found) return null;
  const day = found.slice(1).join("-");
  const date = new Date(`${day}T00:00:00Z`);
  // A date that does not exist, such as 31 February, rolls over or is invalid.
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day) ? day : null;
}

export function stripLayout(items: { day: string | null; width: number }[]): { cards: StripCard[]; width: number } {
  const years = new Set(items.flatMap((i) => (i.day ? [i.day.slice(0, 4)] : [])));
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC", ...(years.size > 1 ? { year: "numeric" } : {}) });
  let end = 0;
  const cards = items.map(({ day, width }, i): StripCard => {
    const starts = i === 0 || items[i - 1].day !== day;
    const left = i === 0 ? 0 : end + (starts ? DAY_GAP : GAP);
    end = left + width;
    return { left, width, heading: starts ? (day ? format.format(new Date(`${day}T00:00:00Z`)) : "No date") : null };
  });
  return { cards, width: end };
}

/** The first and last photo at least half inside the window; the nearest one when none is. */
export function inView(cards: StripCard[], left: number, width: number): [number, number] {
  if (cards.length === 0) return [0, -1];
  const right = left + width;
  const shown = (c: StripCard) => Math.min(c.left + c.width, right) - Math.max(c.left, left) >= c.width / 2;
  const first = cards.findIndex(shown);
  if (first >= 0) {
    let last = first;
    while (last + 1 < cards.length && shown(cards[last + 1])) last++;
    return [first, last];
  }
  const middle = left + width / 2;
  const distance = (c: StripCard) => Math.abs(c.left + c.width / 2 - middle);
  const nearest = cards.reduce((best, c, i) => (distance(c) < distance(cards[best]) ? i : best), 0);
  return [nearest, nearest];
}
