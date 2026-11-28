// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_EDIT } from "@/lib/board/photo-edit";
import { EditedPhoto } from "./EditedPhoto";

const dims = { width: 6000, height: 4000 };

describe("EditedPhoto (DIG-33)", () => {
  it("shapes the photo to its crop and shows only the cropped part", () => {
    render(<EditedPhoto src="/p.avif" alt="Harbor" edit={{ ...DEFAULT_EDIT, ratio: "1:1" }} dims={dims} sizes="100vw" />);
    const frame = screen.getByTestId("edited-photo");
    expect(frame.style.aspectRatio).toMatch(/^1( \/ 1)?$/);
    expect(frame).toHaveAttribute("data-ratio", "1:1");
    const image = screen.getByTestId("edited-photo-image");
    expect(image.style.width).toBe("150%");
    expect(image.style.left).toBe("-25%");
    expect(screen.getByRole("img", { name: "Harbor" })).toBeInTheDocument();
  });

  it("draws the frame colour around the photo", () => {
    render(<EditedPhoto src="/p.avif" alt="Harbor" edit={{ ...DEFAULT_EDIT, frame: "black" }} dims={dims} sizes="100vw" />);
    const frame = screen.getByTestId("edited-photo");
    expect(frame).toHaveAttribute("data-frame", "black");
    expect(frame.style.backgroundColor).toBe("rgb(17, 17, 17)");
  });

  it("shows an unedited photo the way the board always has: a centred 4:5 crop", () => {
    render(<EditedPhoto src="/p.avif" alt="Harbor" edit={null} dims={null} sizes="100vw" />);
    const frame = screen.getByTestId("edited-photo");
    expect(frame.style.aspectRatio).toMatch(/^0.8( \/ 1)?$/);
    expect(screen.getByTestId("edited-photo-image").style.width).toBe("100%");
  });
});
