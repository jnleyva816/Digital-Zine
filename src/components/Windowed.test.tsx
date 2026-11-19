// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Windowed } from "./Windowed";

/** A stand-in IntersectionObserver the test drives by hand. */
let observers: { cb: IntersectionObserverCallback; el: Element | null; options?: IntersectionObserverInit }[] = [];
class FakeObserver {
  private entry: (typeof observers)[number];
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.entry = { cb, el: null, options };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.el = el;
  }
  unobserve() {}
  disconnect() {}
}
const report = (isIntersecting: boolean) =>
  act(() => {
    for (const o of observers) o.cb([{ isIntersecting, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver);
  });

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => vi.unstubAllGlobals());

describe("Windowed (DIG-29)", () => {
  it("renders its content at first, watching a generous margin around the screen", () => {
    render(<Windowed label="fog.jpg"><button>Edit fog.jpg</button></Windowed>);
    expect(screen.getByRole("button", { name: "Edit fog.jpg" })).toBeInTheDocument();
    expect(observers[0].options?.rootMargin).toBe("1500px 0px");
  });

  it("swaps far-off content for a same-size placeholder that still names it, and brings it back", () => {
    render(<Windowed label="fog.jpg"><button>Edit fog.jpg</button></Windowed>);
    const wrapper = screen.getByTestId("windowed");
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({ height: 420 } as DOMRect);
    report(false);
    expect(screen.queryByRole("button", { name: "Edit fog.jpg" })).not.toBeInTheDocument();
    expect(wrapper.style.height).toBe("420px");
    expect(screen.getByText("fog.jpg")).toHaveClass("sr-only");
    report(true);
    expect(screen.getByRole("button", { name: "Edit fog.jpg" })).toBeInTheDocument();
    expect(wrapper.style.height).toBe("");
  });

  it("keeps content that holds keyboard focus, even when it scrolls far away", () => {
    render(<Windowed label="fog.jpg"><button>Edit fog.jpg</button></Windowed>);
    act(() => screen.getByRole("button", { name: "Edit fog.jpg" }).focus());
    report(false);
    expect(screen.getByRole("button", { name: "Edit fog.jpg" })).toHaveFocus();
  });

  it("always renders when the browser cannot observe intersections", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Windowed label="fog.jpg"><button>Edit fog.jpg</button></Windowed>);
    expect(screen.getByRole("button", { name: "Edit fog.jpg" })).toBeInTheDocument();
  });
});
