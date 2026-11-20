// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { describe, expect, it } from "vitest";
import { FlipCard } from "./FlipCard";

const base = {
  pageNumber: 1,
  totalPages: 3,
  imageUrl: "/api/media/x/full.avif",
  flipEnabled: true,
  kind: "photo" as const,
  exif: { iso: 200 },
  recipe: null,
};

describe("FlipCard photo name (DIG-34)", () => {
  it("describes the photo by its name, and shows the name on the back of the card", () => {
    const { unmount } = render(<FlipCard {...base} name="Harbor at dusk" caption="Low tide" />);
    expect(screen.getByRole("img", { name: "Harbor at dusk" })).toBeInTheDocument();
    unmount();
    // The back is hidden from assistive tech until the card is flipped.
    render(<FlipCard {...base} name="Harbor at dusk" defaultFlipped />);
    expect(screen.getByRole("heading", { name: "Harbor at dusk" })).toBeInTheDocument();
  });

  it("keeps the caption, then the page number, as the description when the photo has no name", () => {
    const { unmount } = render(<FlipCard {...base} name={null} caption="Low tide" />);
    expect(screen.getByRole("img", { name: "Low tide" })).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    unmount();
    render(<FlipCard {...base} name={null} />);
    expect(screen.getByRole("img", { name: "Page 1 of 3" })).toBeInTheDocument();
  });
});

describe("FlipCard photo edit (DIG-33)", () => {
  it("shows the photo with its crop and frame, and shapes the card to match", () => {
    render(
      <FlipCard
        {...base}
        edit={{ ratio: "1:1", zoom: 1, x: 0.5, y: 0.5, frame: "polaroid", cardSize: "normal" }}
        dims={{ width: 6000, height: 4000 }}
      />
    );
    expect(screen.getByTestId("edited-photo")).toHaveAttribute("data-frame", "polaroid");
    const card = screen.getByTestId("zine-flip-card-1").firstElementChild as HTMLElement;
    expect(card.style.aspectRatio).toMatch(/^0.88( \/ 1)?$/);
  });

  it("keeps the 4:5 card for an unedited photo", () => {
    render(<FlipCard {...base} />);
    const card = screen.getByTestId("zine-flip-card-1").firstElementChild as HTMLElement;
    expect(card.style.aspectRatio).toMatch(/^0.8( \/ 1)?$/);
  });
});

describe("FlipCard full screen button (DIG-49)", () => {
  const card = { ...base, pageNumber: 2 };

  it("has a button for opening the photo full screen, named for its page", async () => {
    const open = vi.fn();
    render(<FlipCard {...card} onOpenFullScreen={open} />);
    await userEvent.click(screen.getByRole("button", { name: "View page 2 full screen" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
  });

  it("does not flip the card, with the mouse or the keyboard", async () => {
    const open = vi.fn();
    render(<FlipCard {...card} onOpenFullScreen={open} />);
    const article = screen.getByTestId("zine-flip-card-2");
    await userEvent.click(screen.getByRole("button", { name: "View page 2 full screen" }));
    expect(article).toHaveAttribute("data-flipped", "false");
    screen.getByRole("button", { name: "View page 2 full screen" }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(article).toHaveAttribute("data-flipped", "false");
    expect(open).toHaveBeenCalledTimes(3);
  });

  it("sits beside the flip control, not inside it, so no button holds another button", () => {
    render(<FlipCard {...card} onOpenFullScreen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "View page 2 full screen" }).closest("[aria-pressed]")).toBeNull();
  });

  it("still flips when the card itself is pressed", async () => {
    render(<FlipCard {...card} onOpenFullScreen={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /flip to camera details/i }));
    expect(screen.getByTestId("zine-flip-card-2")).toHaveAttribute("data-flipped", "true");
  });

  it("is not offered while the card shows its reverse, since the photo is not in view", () => {
    render(<FlipCard {...card} defaultFlipped onOpenFullScreen={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "View page 2 full screen" })).not.toBeInTheDocument();
  });

  it("is not offered when nothing can open it", () => {
    render(<FlipCard {...card} />);
    expect(screen.queryByRole("button", { name: /full screen/i })).not.toBeInTheDocument();
  });
});

