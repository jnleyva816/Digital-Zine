// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FlipCard, type FlipCardProps } from "./FlipCard";

function setup(props: Partial<FlipCardProps> = {}) {
  render(
    <FlipCard
      pageNumber={1}
      totalPages={3}
      imageUrl="/api/media/seed/plate-01.jpg"
      caption="Persimmons over coals"
      flipEnabled
      kind="photo"
      exif={{ iso: 200, aperture: "f/2.8", cameraMake: "Fujifilm", cameraModel: "GFX 50R" }}
      recipe={null}
      {...props}
    />
  );
  return userEvent.setup();
}

describe("FlipCard", () => {
  it("is a toggle button named for what the reverse shows", () => {
    setup();
    const button = screen.getByRole("button", { name: "Page 1: flip to camera details" });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("names the reverse as a film recipe for recipe pages", () => {
    setup({ kind: "recipe", recipe: { name: "Kodachrome 64", filmSimulation: "Classic Chrome" } });
    expect(screen.getByRole("button", { name: "Page 1: flip to film recipe" })).toBeInTheDocument();
  });

  it("shows the Fujifilm recipe on the back, with the camera details underneath", async () => {
    const user = setup({
      kind: "recipe",
      recipe: {
        name: "Kodachrome 64",
        filmSimulation: "Classic Chrome",
        dynamicRange: "DR200",
        whiteBalance: { mode: "Daylight", red: 2, blue: -5 },
        highlight: 0,
        shadow: 0.5,
      },
    });
    await user.click(screen.getByRole("button", { name: /flip to film recipe/ }));
    expect(screen.getByRole("heading", { name: "Kodachrome 64" })).toBeInTheDocument();
    const terms = screen.getAllByRole("term").map((t) => t.textContent);
    const defs = screen.getAllByRole("definition").map((d) => d.textContent);
    expect(Object.fromEntries(terms.map((t, i) => [t, defs[i]]))).toEqual({
      "Film Simulation": "Classic Chrome",
      "Dynamic Range": "DR200",
      "White Balance": "Daylight, +2 Red & -5 Blue",
      Highlight: "0",
      Shadow: "+0.5",
    });
    expect(screen.getByText(/Fujifilm GFX 50R/)).toBeInTheDocument();
    expect(screen.queryByText(/ingredient|method|kitchen|yield/i)).not.toBeInTheDocument();
  });

  it("hides the reverse from assistive tech until flipped, then hides the front", async () => {
    const user = setup();
    expect(screen.getByRole("img", { name: "Persimmons over coals" })).toBeInTheDocument();
    expect(screen.queryByRole("definition")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /flip to camera details/ }));

    expect(screen.getByRole("button", { name: /flip to camera details/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("definition").map((d) => d.textContent)).toContain("ISO 200");
    expect(screen.queryByRole("img", { name: "Persimmons over coals" })).not.toBeInTheDocument();
  });

  it("toggles with Enter and Space", async () => {
    const user = setup();
    const button = screen.getByRole("button", { name: /flip/ });
    button.focus();
    await user.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.keyboard(" ");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("is a plain figure with no control or reverse when flip is off", async () => {
    const user = setup({ flipEnabled: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const img = screen.getByRole("img", { name: "Persimmons over coals" });
    await user.click(img);
    expect(screen.getByRole("img", { name: "Persimmons over coals" })).toBeInTheDocument();
    expect(screen.queryByText(/flip/i)).not.toBeInTheDocument();
  });

  it("falls back to a page-numbered alt text when there is no caption", () => {
    setup({ caption: "" });
    const card = screen.getByRole("article");
    expect(within(card).getByRole("img", { name: "Page 1 of 3" })).toBeInTheDocument();
  });
});
