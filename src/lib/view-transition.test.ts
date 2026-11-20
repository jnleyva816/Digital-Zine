// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { withViewTransition } from "./view-transition";

// DIG-49: the photo grows from its card to full screen, and a browser without View Transitions just updates.
type Doc = { startViewTransition?: unknown };
const doc = document as unknown as Doc;

function reducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
}

afterEach(() => {
  delete doc.startViewTransition;
  vi.unstubAllGlobals();
});

describe("withViewTransition", () => {
  it("just runs the update when the browser has no View Transitions", () => {
    reducedMotion(false);
    const update = vi.fn();
    withViewTransition({ from: null, update });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("names the source element for the 'before' snapshot, then releases the name as the new state is built", async () => {
    reducedMotion(false);
    const from = document.createElement("div");
    let nameAtCapture = "";
    let nameDuringUpdate = "unset";
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((r) => (finish = r));
    doc.startViewTransition = vi.fn((cb: () => void) => {
      // The browser captures the old state before it calls the callback.
      nameAtCapture = from.style.getPropertyValue("view-transition-name");
      cb();
      return { finished };
    });
    const update = vi.fn(() => {
      nameDuringUpdate = from.style.getPropertyValue("view-transition-name");
    });

    withViewTransition({ from, update });
    expect(doc.startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(nameAtCapture).toBe("zine-photo");
    // Only the full-screen photo may carry the name in the new state; two elements with one name cancel the animation.
    expect(nameDuringUpdate).toBe("");
    finish();
    await finished;
    expect(from.style.getPropertyValue("view-transition-name")).toBe("");
  });

  it("skips the animation, but still updates, when the reader prefers reduced motion", () => {
    reducedMotion(true);
    doc.startViewTransition = vi.fn();
    const update = vi.fn();
    withViewTransition({ from: document.createElement("div"), update });
    expect(doc.startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
