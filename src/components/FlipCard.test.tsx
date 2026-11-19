// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
