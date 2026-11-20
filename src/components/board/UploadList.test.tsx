// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadList } from "./UploadList";

describe("UploadList (DIG-47)", () => {
  it("renders nothing when nothing is uploading", () => {
    const { container } = render(<UploadList uploads={[]} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows each file's stage while it uploads, with no alert", () => {
    render(<UploadList uploads={[{ id: "a", name: "fog.jpg", stage: "uploading" }]} onDismiss={vi.fn()} />);
    const list = screen.getByRole("list", { name: "Uploads" });
    expect(list).toHaveTextContent("fog.jpg");
    expect(list).toHaveTextContent("Uploading");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("announces a failed file's error, and Dismiss removes it", async () => {
    const onDismiss = vi.fn();
    render(<UploadList uploads={[{ id: "b", name: "x.png", stage: "error", error: "Only JPEG photos can be uploaded." }]} onDismiss={onDismiss} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Only JPEG photos can be uploaded.");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("b");
  });
});
