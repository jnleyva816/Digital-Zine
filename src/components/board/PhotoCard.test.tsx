// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { boardAsset } from "./board-test-utils";
import { PhotoCard, type PhotoCardProps } from "./PhotoCard";

function renderCard(overrides: Partial<PhotoCardProps> = {}) {
  const props: PhotoCardProps = {
    asset: boardAsset("fog"),
    index: 0,
    count: 2,
    label: "fog.jpg",
    dragging: false,
    dropHighlight: false,
    draggable: true,
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onDragOverSide: vi.fn().mockReturnValue(false),
    onMoveBy: vi.fn(),
    confirmingDelete: false,
    deleting: false,
    onAskDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    onDelete: vi.fn(),
    onRetryProcessing: vi.fn(),
    onEditPhoto: vi.fn(),
    onEditRecipe: vi.fn(),
    hasFoundRecipe: false,
    naming: false,
    onToggleNaming: vi.fn(),
    onSaveName: vi.fn().mockResolvedValue(null),
    otherBoards: [],
    moving: false,
    onToggleMoving: vi.fn(),
    onMoveToBoard: vi.fn().mockResolvedValue(null),
    usedIn: [],
    ...overrides,
  };
  render(
    <ol>
      <PhotoCard {...props} />
    </ol>
  );
  return props;
}

describe("PhotoCard (DIG-47)", () => {
  it("shows a processed photo with its actions", async () => {
    const props = renderCard();
    expect(screen.getByRole("img", { name: "fog.jpg" })).toBeInTheDocument();
    expect(screen.getByText("No EXIF")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move fog.jpg earlier" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move fog.jpg later" }));
    expect(props.onMoveBy).toHaveBeenCalledWith(1);
    // No other board, so no move-to-board button.
    expect(screen.queryByRole("button", { name: "Move fog.jpg to another board" })).not.toBeInTheDocument();
  });

  it("shows a photo that is still processing, without the photo editor", () => {
    renderCard({ asset: boardAsset("fog", { status: "processing" }) });
    expect(screen.getByRole("status")).toHaveTextContent("Processing fog.jpg…");
    expect(screen.queryByRole("button", { name: "Edit fog.jpg" })).not.toBeInTheDocument();
  });

  it("shows why a photo failed to process, and retries it", async () => {
    const props = renderCard({ asset: boardAsset("fog", { status: "failed", processingError: "This file is not a photo." }) });
    expect(screen.getByText("This file is not a photo.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry processing fog.jpg" }));
    expect(props.onRetryProcessing).toHaveBeenCalledOnce();
  });

  it("asks before deleting, and shows the delete in progress", async () => {
    const props = renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Delete fog.jpg" }));
    expect(props.onAskDelete).toHaveBeenCalledOnce();
  });

  it("disables the confirmation while the delete runs", () => {
    renderCard({ confirmingDelete: true, deleting: true });
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep" })).toBeDisabled();
  });

  it("offers to review a recipe found in the photo", () => {
    renderCard({ hasFoundRecipe: true });
    // jsdom drops the space before the screen-reader-only " for fog.jpg"; browsers keep it.
    expect(screen.getByRole("button", { name: /^Review recipe found in photo ?for fog\.jpg$/ })).toBeInTheDocument();
  });
});
