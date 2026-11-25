// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZinePages, type ZinePageData } from "./ZinePages";

// DIG-50: reading a zine like a book.
const page = (n: number): ZinePageData => ({
  pageNumber: n,
  imageUrl: `/api/media/p${n}/full.avif`,
  name: `Plate ${n}`,
  edit: null,
  dims: { width: 6000, height: 4000 },
  blurDataUrl: null,
  caption: "",
  flipEnabled: true,
  kind: "photo",
  exif: { iso: 200 },
  recipe: null,
});
const pages = [1, 2, 3, 4, 5].map(page);

function screenWidth(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width") ? wide : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/z/test");
  screenWidth(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

const bookButton = () => screen.getByRole("button", { name: "Book" });
const openBook = () => userEvent.click(bookButton());
const next = () => screen.getByRole("button", { name: "Next page" });
const previous = () => screen.getByRole("button", { name: "Previous page" });
const shown = () => screen.getAllByRole("button", { name: /^Page \d+: flip/ }).map((b) => Number(/\d+/.exec(b.getAttribute("aria-label")!)![0]));

describe("choosing how to read", () => {
  it("starts as a scroll, with every page in the document", () => {
    render(<ZinePages pages={pages} />);
    expect(screen.getByRole("button", { name: "Scroll" })).toHaveAttribute("aria-pressed", "true");
    expect(bookButton()).toHaveAttribute("aria-pressed", "false");
    expect(shown()).toEqual([1, 2, 3, 4, 5]);
  });

  it("switches to the book, puts the mode in the address, and remembers it", async () => {
    const first = render(<ZinePages pages={pages} />);
    await openBook();
    expect(shown()).toEqual([1]);
    expect(location.search).toBe("?view=book");
    first.unmount();

    history.replaceState(null, "", "/z/test");
    render(<ZinePages pages={pages} />);
    await waitFor(() => expect(shown()).toEqual([1]));
  });

  it("opens in the mode a shared link asks for, over the remembered one", async () => {
    localStorage.setItem("zine-reading-view", "book");
    history.replaceState(null, "", "/z/test?view=scroll");
    render(<ZinePages pages={pages} />);
    expect(shown()).toEqual([1, 2, 3, 4, 5]);
  });

  it("still works when the browser refuses storage", async () => {
    const refuse = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<ZinePages pages={pages} />);
    await openBook();
    expect(shown()).toEqual([1]);
    refuse.mockRestore();
  });
});

describe("turning pages", () => {
  it("goes page by page on a phone, and stops at both ends", async () => {
    render(<ZinePages pages={pages} />);
    await openBook();
    expect(previous()).toBeDisabled();
    for (const expected of [2, 3, 4, 5]) {
      await userEvent.click(next());
      expect(shown()).toEqual([expected]);
    }
    expect(next()).toBeDisabled();
    await userEvent.click(previous());
    expect(shown()).toEqual([4]);
  });

  it("shows the cover alone and then facing pages on a wide screen", async () => {
    screenWidth(true);
    render(<ZinePages pages={pages} />);
    await openBook();
    expect(shown()).toEqual([1]);
    await userEvent.click(next());
    expect(shown()).toEqual([2, 3]);
    await userEvent.click(next());
    expect(shown()).toEqual([4, 5]);
  });

  it("turns with the arrow keys, Home, and End", async () => {
    render(<ZinePages pages={pages} />);
    await openBook();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(shown()).toEqual([3]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(shown()).toEqual([2]);
    await userEvent.keyboard("{End}");
    expect(shown()).toEqual([5]);
    await userEvent.keyboard("{Home}");
    expect(shown()).toEqual([1]);
  });

  it("leaves the arrow keys alone while scrolling, and while a photo is full screen", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.keyboard("{ArrowRight}");
    expect(shown()).toHaveLength(5);
    await openBook();
    await userEvent.click(screen.getByRole("button", { name: "View page 1 full screen" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(within(screen.getByRole("dialog")).getByText("2 / 5")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    // Closing lands on the page the reader ended on.
    await waitFor(() => expect(shown()).toEqual([2]));
  });

  it("turns when the left or right edge is tapped, without flipping a card", async () => {
    render(<ZinePages pages={pages} />);
    await openBook();
    await userEvent.click(screen.getByTestId("book-edge-next"));
    expect(shown()).toEqual([2]);
    expect(screen.getByRole("button", { name: /^Page 2: flip/ })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByTestId("book-edge-previous"));
    expect(shown()).toEqual([1]);
  });

  it("announces each turn and shows progress", async () => {
    screenWidth(true);
    render(<ZinePages pages={pages} />);
    await openBook();
    const bar = screen.getByRole("progressbar", { name: "Reading progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    await userEvent.click(next());
    expect(screen.getByRole("status")).toHaveTextContent("Pages 2 and 3 of 5");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
  });

  it("still flips a card to its back", async () => {
    render(<ZinePages pages={pages} />);
    await openBook();
    const card = screen.getByRole("button", { name: /^Page 1: flip/ });
    await userEvent.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
    // Space flips the focused card; it does not turn the page.
    act(() => card.focus());
    await userEvent.keyboard(" ");
    expect(card).toHaveAttribute("aria-pressed", "false");
    expect(shown()).toEqual([1]);
  });
});
