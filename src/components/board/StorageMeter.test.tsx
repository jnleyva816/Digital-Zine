// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ACCOUNT_STORAGE_BYTES } from "@/lib/billing/limits";
import { StorageMeter } from "./StorageMeter";

const MB = 1024 * 1024;

describe("StorageMeter (DIG-32, DIG-25)", () => {
  it("shows how much of the account's 2 GB is used, as an accessible meter", () => {
    render(<StorageMeter usedBytes={512 * MB} />);
    const meter = screen.getByRole("meter", { name: "Storage" });
    expect(meter).toHaveAttribute("aria-valuenow", String(512 * MB));
    expect(meter).toHaveAttribute("aria-valuemax", String(ACCOUNT_STORAGE_BYTES));
    expect(meter).toHaveAttribute("aria-valuetext", "512 MB of 2 GB used");
    expect(screen.getByText("512 MB of 2 GB used")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says the 2 GB is shared by every board", () => {
    render(<StorageMeter usedBytes={0} />);
    expect(screen.getByText("Shared by all your boards.")).toBeInTheDocument();
  });

  it("warns when storage is nearly full", () => {
    render(<StorageMeter usedBytes={ACCOUNT_STORAGE_BYTES - 50 * MB} />);
    expect(screen.getByText("Almost full. Delete photos to make room.")).toBeInTheDocument();
  });

  it("says plainly when storage is full", () => {
    render(<StorageMeter usedBytes={ACCOUNT_STORAGE_BYTES} />);
    expect(screen.getByText("2 GB of 2 GB used")).toBeInTheDocument();
    expect(screen.getByText("Your storage is full. Delete photos to upload more.")).toBeInTheDocument();
  });
});
