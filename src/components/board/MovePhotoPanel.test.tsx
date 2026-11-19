// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MovePhotoPanel } from "./MovePhotoPanel";

const BOARDS = [
  { id: "tokyo", name: "Tokyo" },
  { id: "kyoto", name: "Kyoto" },
];

describe("MovePhotoPanel (DIG-25)", () => {
  it("moves the photo to the board I pick", async () => {
    const onMove = vi.fn().mockResolvedValue(null);
    render(<MovePhotoPanel label="fog.jpg" boards={BOARDS} usedIn={[]} onMove={onMove} onCancel={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Move fog.jpg" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Move to board"), "Kyoto");
    await userEvent.click(screen.getByRole("button", { name: "Move photo" }));
    expect(onMove).toHaveBeenCalledWith("kyoto");
    expect(screen.queryByText(/is used in/)).not.toBeInTheDocument();
  });

  it("tells me which zines use the photo before I move it", () => {
    render(
      <MovePhotoPanel
        label="fog.jpg"
        boards={BOARDS}
        usedIn={["Harbor Notes", "Fog Issue"]}
        onMove={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      screen.getByText("This photo is used in “Harbor Notes” and “Fog Issue”. It stays on those zines' pages after the move.")
    ).toBeInTheDocument();
  });

  it("shows why a move failed and keeps the panel open", async () => {
    const onMove = vi.fn().mockResolvedValue("Board not found");
    render(<MovePhotoPanel label="fog.jpg" boards={BOARDS} usedIn={[]} onMove={onMove} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Move photo" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Board not found"));
    expect(screen.getByRole("group", { name: "Move fog.jpg" })).toBeInTheDocument();
  });

  it("can be cancelled", async () => {
    const onCancel = vi.fn();
    render(<MovePhotoPanel label="fog.jpg" boards={BOARDS} usedIn={[]} onMove={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
