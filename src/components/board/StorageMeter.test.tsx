// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BOARD_STORAGE_BYTES } from "@/lib/limits";
import { StorageMeter } from "./StorageMeter";

const MB = 1024 * 1024;

describe("StorageMeter (DIG-32)", () => {
  it("shows how much of the 2 GB board is used, as an accessible meter", () => {
    render(<StorageMeter usedBytes={512 * MB} />);
    const meter = screen.getByRole("meter", { name: "Board storage" });
    expect(meter).toHaveAttribute("aria-valuenow", String(512 * MB));
    expect(meter).toHaveAttribute("aria-valuemax", String(BOARD_STORAGE_BYTES));
    expect(meter).toHaveAttribute("aria-valuetext", "512 MB of 2 GB used");
    expect(screen.getByText("512 MB of 2 GB used")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns when the board is nearly full", () => {
    render(<StorageMeter usedBytes={BOARD_STORAGE_BYTES - 50 * MB} />);
    expect(screen.getByText("Almost full. Delete photos to make room.")).toBeInTheDocument();
  });

  it("says plainly when the board is full", () => {
    render(<StorageMeter usedBytes={BOARD_STORAGE_BYTES} />);
    expect(screen.getByText("2 GB of 2 GB used")).toBeInTheDocument();
    expect(screen.getByText("Your board is full. Delete photos to upload more.")).toBeInTheDocument();
  });
});
