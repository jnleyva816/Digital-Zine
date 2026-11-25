import { flushSync } from "react-dom";

/** Photos that move at once. Each is a picture the browser holds; the rest fade with the page (DIG-92). */
export const MAX_MOVING = 60;

interface Transition {
  finished: Promise<unknown>;
  ready: Promise<unknown>;
  updateCallbackDone: Promise<unknown>;
}

export const prefersReducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Whether the middle of an element is on screen, and not scrolled out of anything it sits in. */
function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(p);
    if (/^(visible)?$/.test(overflowX) && /^(visible)?$/.test(overflowY)) continue;
    const b = p.getBoundingClientRect();
    if (x < b.left || x > b.right || y < b.top || y > b.bottom) return false;
  }
  return true;
}

/** The photos drawn on screen now, one element each. A view marks them with `data-flow`. */
function shown(): Map<string, HTMLElement> {
  const found = new Map<string, HTMLElement>();
  for (const el of document.querySelectorAll<HTMLElement>("[data-flow]")) {
    const id = el.dataset.flow!;
    if (!found.has(id) && onScreen(el)) found.set(id, el);
  }
  return found;
}

/** Where a photo is on screen, if it is. */
export const flowElement = (id: string): HTMLElement | null => shown().get(id) ?? null;

const clearNames = () => {
  for (const el of document.querySelectorAll<HTMLElement>("[data-flow]")) el.style.removeProperty("view-transition-name");
};

function nameShown(order: string[]) {
  clearNames();
  const found = shown();
  // In board order, so the photos named before are the ones named after. A photo the list has not reached comes last.
  const ids = [...new Set([...order, ...found.keys()])].filter((id) => found.has(id)).slice(0, MAX_MOVING);
  for (const id of ids) found.get(id)!.style.setProperty("view-transition-name", `board-photo-${id.replace(/[^\w-]/g, "_")}`);
}

let latest: Transition | null = null;

/**
 * Changes the board so that photos on screen move from where they were to where they go (DIG-92).
 * With reduced motion it is a short cross-fade, and without View Transitions it just changes.
 */
export function transitionBoard({ order, update }: { order: string[]; update: () => void }): void {
  const doc = document as unknown as { startViewTransition?: (update: () => void) => Transition };
  if (typeof doc.startViewTransition !== "function") {
    update();
    return;
  }
  const move = !prefersReducedMotion();
  const root = document.documentElement;
  root.dataset.boardTransition = move ? "move" : "fade";
  if (move) nameShown(order);
  const transition = doc.startViewTransition(() => {
    // The browser pictures the new state as soon as this returns.
    flushSync(update);
    if (move) nameShown(order);
  });
  latest = transition;
  const end = () => {
    if (latest !== transition) return;
    latest = null;
    clearNames();
    delete root.dataset.boardTransition;
  };
  transition.finished.then(end, end);
  // A skipped animation (a hidden tab, a second switch) is not an error: the view has changed.
  transition.ready.catch(() => undefined);
  transition.updateCallbackDone.catch(() => undefined);
}
