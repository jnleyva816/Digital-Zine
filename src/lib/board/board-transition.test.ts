// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_MOVING, flowElement, transitionBoard } from "./board-transition";

// DIG-92: photos move between the board's views, and a browser without View Transitions just switches.
const doc = document as unknown as { startViewTransition?: unknown };

function reducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce") }));
}
function photo(id: string, top = 10) {
  const el = document.createElement("div");
  el.dataset.flow = id;
  el.getBoundingClientRect = () => new DOMRect(10, top, 100, 100);
  document.body.append(el);
  return el;
}
const nameOf = (el: HTMLElement) => el.style.getPropertyValue("view-transition-name");

/** A browser that captures, updates, and finishes when told. */
function browser() {
  const before: string[][] = [];
  const finish: (() => void)[] = [];
  doc.startViewTransition = vi.fn((update: () => void) => {
    before.push([...document.querySelectorAll<HTMLElement>("[data-flow]")].map(nameOf));
    update();
    const finished = new Promise<void>((r) => finish.push(r));
    return { finished, ready: Promise.reject(new Error("skipped")), updateCallbackDone: Promise.resolve() };
  });
  return { before, finish };
}

beforeEach(() => reducedMotion(false));
afterEach(() => {
  delete doc.startViewTransition;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("transitionBoard", () => {
  it("just updates, at once, when the browser has no View Transitions", () => {
    const el = photo("a");
    const update = vi.fn();
    transitionBoard({ order: ["a"], update });
    expect(update).toHaveBeenCalledTimes(1);
    expect(nameOf(el)).toBe("");
    expect(document.documentElement.dataset.boardTransition).toBeUndefined();
  });

  it("gives a photo one name before and after, and cleans up, even when the browser skips the animation", async () => {
    const { before, finish } = browser();
    const old = photo("a");
    let next!: HTMLElement;
    transitionBoard({
      order: ["a"],
      update: () => {
        old.remove();
        next = photo("a");
      },
    });
    expect(before[0][0]).not.toBe("");
    expect(nameOf(next)).toBe(before[0][0]);
    expect(document.documentElement.dataset.boardTransition).toBe("move");
    finish[0]();
    await vi.waitFor(() => expect(nameOf(next)).toBe(""));
    expect(document.documentElement.dataset.boardTransition).toBeUndefined();
  });

  it("names only photos on screen, each once, and the first ones in board order when there are many", () => {
    const { before } = browser();
    photo("off", 5000);
    photo("twice");
    photo("twice");
    const ids = Array.from({ length: MAX_MOVING + 10 }, (_, i) => `p${i}`);
    for (const id of [...ids].reverse()) photo(id);
    transitionBoard({ order: ["off", "twice", ...ids], update: () => undefined });
    const named = before[0].filter(Boolean);
    expect(named).toHaveLength(MAX_MOVING);
    expect(new Set(named).size).toBe(MAX_MOVING);
    expect(before[0].slice(0, 3)).toEqual(["", expect.stringMatching(/twice/), ""]);
    expect(nameOf(flowElement("p0")!)).not.toBe("");
    expect(nameOf(flowElement(`p${MAX_MOVING + 9}`)!)).toBe("");
  });

  it("leaves out a photo scrolled out of its own container", () => {
    const { before } = browser();
    const box = document.createElement("div");
    box.style.overflow = "hidden";
    box.getBoundingClientRect = () => new DOMRect(0, 0, 300, 100);
    document.body.append(box);
    box.append(photo("a", 90));
    transitionBoard({ order: ["a"], update: () => undefined });
    expect(before[0]).toEqual([""]);
  });

  it("only cross-fades when the creator prefers reduced motion", () => {
    reducedMotion(true);
    const { before } = browser();
    photo("a");
    const update = vi.fn();
    transitionBoard({ order: ["a"], update });
    expect(update).toHaveBeenCalledTimes(1);
    expect(before[0]).toEqual([""]);
    expect(document.documentElement.dataset.boardTransition).toBe("fade");
  });

  it("does not let an earlier switch's end clear a later one", async () => {
    const { finish } = browser();
    const el = photo("a");
    transitionBoard({ order: ["a"], update: () => undefined });
    transitionBoard({ order: ["a"], update: () => undefined });
    finish[0]();
    await new Promise((r) => setTimeout(r));
    expect(nameOf(el)).not.toBe("");
    finish[1]();
    await vi.waitFor(() => expect(nameOf(el)).toBe(""));
  });
});
