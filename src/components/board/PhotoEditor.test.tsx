// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_EDIT, type PhotoEdit } from "@/lib/board/photo-edit";
import { PhotoEditor } from "./PhotoEditor";

function setup(over: Partial<React.ComponentProps<typeof PhotoEditor>> = {}) {
  const onSave = vi.fn<(edit: PhotoEdit | null) => Promise<string | null>>().mockResolvedValue(null);
  const onClose = vi.fn();
  render(
    <PhotoEditor
      open
      label="fog.jpg"
      src="/p.avif"
      dims={{ width: 6000, height: 4000 }}
      initial={null}
      usedIn={[]}
      onSave={onSave}
      onClose={onClose}
      {...over}
    />
  );
  return { onSave, onClose };
}

describe("PhotoEditor (DIG-33)", () => {
  it("opens on the photo's current look: 4:5, no zoom, no frame, normal card", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Edit fog.jpg" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "4:5" })).toBeChecked();
    expect(screen.getByRole("slider", { name: "Zoom" })).toHaveValue("1");
    expect(screen.getByRole("radio", { name: "None" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Normal" })).toBeChecked();
  });

  it("saves the ratio, zoom, frame, and card size I pick, and previews them", async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "1:1" }));
    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });
    await userEvent.click(screen.getByRole("radio", { name: "Polaroid" }));
    await userEvent.click(screen.getByRole("radio", { name: "Large" }));
    const preview = screen.getByTestId("edited-photo");
    expect(preview).toHaveAttribute("data-ratio", "1:1");
    expect(preview).toHaveAttribute("data-frame", "polaroid");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_EDIT, ratio: "1:1", zoom: 2, frame: "polaroid", cardSize: "large" });
  });

  it("moves the photo in its frame with the arrow keys", async () => {
    const { onSave } = setup({ initial: { ...DEFAULT_EDIT, zoom: 2 } });
    const position = screen.getByRole("group", { name: "Photo position" });
    position.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowUp}");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const saved = onSave.mock.calls[0][0]!;
    expect(saved.x).toBeCloseTo(0.54);
    expect(saved.y).toBeCloseTo(0.48);
  });

  it("resets to the unedited look, which saves as no edit", async () => {
    const { onSave } = setup({ initial: { ...DEFAULT_EDIT, ratio: "16:9", frame: "black" } });
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("radio", { name: "4:5" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("says which zines will change, including published ones", () => {
    setup({ usedIn: ["Harbor Notes", "Fog Issue"] });
    expect(
      screen.getByText("This photo is used in “Harbor Notes” and “Fog Issue”. Saving changes it there too, including published zines.")
    ).toBeInTheDocument();
  });

  it("closes without saving on Cancel", async () => {
    const { onSave, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows why saving failed and stays open", async () => {
    const onSave = vi.fn().mockResolvedValue("Could not save the edit.");
    setup({ onSave });
    await userEvent.click(screen.getByRole("radio", { name: "1:1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not save the edit."));
    expect(screen.getByRole("heading", { name: "Edit fog.jpg" })).toBeInTheDocument();
  });

  describe("option previews (DIG-48)", () => {
    const ratioOf = (shape: HTMLElement) => parseFloat(shape.style.width) / parseFloat(shape.style.height);

    it.each([
      ["4:5", 4 / 5],
      ["1:1", 1],
      ["3:2", 3 / 2],
      ["2:3", 2 / 3],
      ["16:9", 16 / 9],
    ])("the %s option shows a shape with that ratio, hidden from screen readers", (name, aspect) => {
      setup();
      const option = screen.getByRole("radio", { name }).closest("label")!;
      const shape = option.querySelector<HTMLElement>("[data-ratio-shape]")!;
      expect(shape).not.toBeNull();
      expect(shape.closest("[aria-hidden='true']")).not.toBeNull();
      expect(ratioOf(shape)).toBeCloseTo(aspect, 1);
    });

    it("the Original option shows the photo's own shape", () => {
      setup({ dims: { width: 6000, height: 4000 } });
      const shape = screen.getByRole("radio", { name: "Original" }).closest("label")!.querySelector<HTMLElement>("[data-ratio-shape]")!;
      expect(ratioOf(shape)).toBeCloseTo(1.5, 1);
    });

    it("the Original option still shows a shape when the photo's size is not known", () => {
      setup({ dims: null });
      expect(screen.getByRole("radio", { name: "Original" }).closest("label")!.querySelector("[data-ratio-shape]")).not.toBeNull();
    });

    it.each(["None", "Thin white", "White mat", "Black", "Polaroid"])("the %s frame shows a small preview", (name) => {
      setup();
      const swatch = screen.getByRole("radio", { name }).closest("label")!.querySelector("[data-frame-swatch]");
      expect(swatch).not.toBeNull();
      expect(swatch!.closest("[aria-hidden='true']")).not.toBeNull();
    });

    it("keeps each option's name as just its label, so screen readers do not hear the previews", () => {
      setup();
      for (const name of ["Original", "4:5", "None", "Thin white", "Polaroid", "Normal", "Large"]) {
        expect(screen.getByRole("radio", { name })).toBeInTheDocument();
      }
    });

    it("keeps Save, Cancel and Reset outside the scrolling controls, so they are always on screen", () => {
      setup();
      for (const name of ["Save", "Cancel", "Reset"]) {
        expect(screen.getByRole("button", { name }).closest("[data-editor-scroll]")).toBeNull();
      }
      expect(screen.getByRole("slider", { name: "Zoom" }).closest("[data-editor-scroll]")).not.toBeNull();
    });
  });
});
