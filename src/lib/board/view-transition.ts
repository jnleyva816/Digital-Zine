/** The name that links a card's photo to the same photo full screen (DIG-49). */
export const PHOTO_TRANSITION_NAME = "zine-photo";

type ViewTransitionDocument = {
  startViewTransition?: (update: () => void) => { finished: Promise<unknown> };
};

/**
 * Runs `update` so the photo grows from its card to full screen with the View Transitions API.
 * Without that API, or when the reader prefers reduced motion, it simply runs `update`.
 *
 * `from` is named for the "before" snapshot and released the moment the new state is built: if it
 * still carried the name, the full-screen photo and the card would share it and the browser
 * would cancel the animation.
 */
export function withViewTransition({ from, update }: { from: HTMLElement | null; update: () => void }): void {
  const doc = typeof document === "undefined" ? undefined : (document as unknown as ViewTransitionDocument);
  const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc || typeof doc.startViewTransition !== "function" || reduceMotion) {
    update();
    return;
  }

  const release = () => from?.style.removeProperty("view-transition-name");
  from?.style.setProperty("view-transition-name", PHOTO_TRANSITION_NAME);
  const transition = doc.startViewTransition(() => {
    release();
    update();
  });
  transition?.finished?.then(release, release);
}
