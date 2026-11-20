// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ZinePages, type ZinePageData } from "./ZinePages";

// DIG-49: the full-screen photo view on a public zine.
const page = (n: number, over: Partial<ZinePageData> = {}): ZinePageData => ({
  pageNumber: n,
  imageUrl: `/api/media/p${n}/full.avif`,
  name: `Plate ${n}`,
  edit: null,
  dims: { width: 6000, height: 4000 },
  blurDataUrl: null,
  caption: n === 2 ? "The cellar at dawn" : "",
  flipEnabled: n !== 2,
  kind: "photo",
  exif: { iso: 200 },
  recipe: null,
  ...over,
});
const pages = [page(1), page(2), page(3)];

beforeEach(() => {
  history.replaceState(null, "", "/z/test");
});
afterEach(() => {
  history.replaceState(null, "", "/");
});

const expand = (n: number) => screen.getByRole("button", { name: `View page ${n} full screen` });
const viewer = () => screen.getByRole("dialog");

describe("opening and closing", () => {
  it("offers every page's photo full screen", () => {
    render(<ZinePages pages={pages} />);
    for (const n of [1, 2, 3]) expect(expand(n)).toBeInTheDocument();
  });

  it("opens a modal viewer named for the photo and its place, with a page counter", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(2));
    expect(screen.getByRole("dialog", { name: "Plate 2, page 2 of 3" })).toBeInTheDocument();
    expect(within(viewer()).getByText("2 / 3")).toBeInTheDocument();
    expect(within(viewer()).getByText("The cellar at dawn")).toBeInTheDocument();
  });

  it("is closed until opened, and mounts no full-screen photo", () => {
    render(<ZinePages pages={pages} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes with the close button, and puts focus back on the page the reader came from", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(2));
    await userEvent.click(within(viewer()).getByRole("button", { name: "Close full screen view" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(expand(2)).toHaveFocus());
  });

  it("closes with Escape", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(1));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lands back on the page the reader ended on, not the one they started from", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(1));
    await userEvent.click(within(viewer()).getByRole("button", { name: "Next photo" }));
    await userEvent.click(within(viewer()).getByRole("button", { name: "Next photo" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(expand(3)).toHaveFocus());
  });
});

describe("moving between photos", () => {
  it("goes next and previous with the buttons, and stops at the ends", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(1));
    expect(within(viewer()).getByRole("button", { name: "Previous photo" })).toBeDisabled();
    await userEvent.click(within(viewer()).getByRole("button", { name: "Next photo" }));
    expect(within(viewer()).getByText("2 / 3")).toBeInTheDocument();
    await userEvent.click(within(viewer()).getByRole("button", { name: "Next photo" }));
    expect(within(viewer()).getByText("3 / 3")).toBeInTheDocument();
    expect(within(viewer()).getByRole("button", { name: "Next photo" })).toBeDisabled();
    await userEvent.click(within(viewer()).getByRole("button", { name: "Previous photo" }));
    expect(within(viewer()).getByText("2 / 3")).toBeInTheDocument();
  });

  it("goes next and previous with the arrow keys", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(1));
    await userEvent.keyboard("{ArrowRight}");
    expect(within(viewer()).getByText("2 / 3")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(within(viewer()).getByText("1 / 3")).toBeInTheDocument();
  });

  it("announces the page to screen readers as it changes", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(1));
    expect(within(viewer()).getByText("1 / 3")).toHaveAttribute("aria-live", "polite");
  });
});

describe("the address bar", () => {
  it("puts the page in the URL when opened, and follows the reader between photos", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(2));
    expect(location.hash).toBe("#page-2");
    await userEvent.keyboard("{ArrowRight}");
    expect(location.hash).toBe("#page-3");
  });

  it("clears the page from the URL when closed", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(2));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(location.hash).toBe(""));
  });

  it("opens straight to the photo a shared link names", async () => {
    history.replaceState(null, "", "/z/test#page-3");
    render(<ZinePages pages={pages} />);
    expect(await screen.findByRole("dialog", { name: /page 3 of 3/i })).toBeInTheDocument();
  });

  it("closing a viewer opened from a shared link stays on the zine", async () => {
    history.replaceState(null, "", "/z/test#page-3");
    render(<ZinePages pages={pages} />);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location.pathname).toBe("/z/test");
    expect(location.hash).toBe("");
  });

  it("ignores a fragment that is not one of its pages", () => {
    history.replaceState(null, "", "/z/test#page-9");
    render(<ZinePages pages={pages} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the reader presses Back", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(2));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => history.back());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("zoom", () => {
  it("starts unzoomed, and the zoom button zooms in and back out, for readers without a touch screen", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(1));
    const stage = within(viewer()).getByTestId("lightbox-photo");
    expect(stage).toHaveAttribute("data-zoom", "1");
    await userEvent.click(within(viewer()).getByRole("button", { name: "Zoom in" }));
    expect(Number(stage.getAttribute("data-zoom"))).toBeGreaterThan(1);
    await userEvent.click(within(viewer()).getByRole("button", { name: "Zoom out" }));
    expect(stage).toHaveAttribute("data-zoom", "1");
  });

  it("starts each photo unzoomed", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(1));
    await userEvent.click(within(viewer()).getByRole("button", { name: "Zoom in" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(within(viewer()).getByTestId("lightbox-photo")).toHaveAttribute("data-zoom", "1");
  });
});

describe("the page itself", () => {
  it("still lists every page, so it reads without JavaScript", () => {
    render(<ZinePages pages={pages} />);
    expect(screen.getByRole("list", { name: "Pages" }).querySelectorAll("li")).toHaveLength(3);
  });

  it("opening the viewer does not flip the card", async () => {
    render(<ZinePages pages={pages} />);
    await userEvent.click(expand(1));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByTestId("zine-flip-card-1")).toHaveAttribute("data-flipped", "false");
  });
});
