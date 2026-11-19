// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhotoNameForm } from "./PhotoNameForm";

describe("PhotoNameForm (DIG-34)", () => {
  it("saves a trimmed name", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(<PhotoNameForm fileName="DSCF1368.JPG" initialName={null} onSave={onSave} onCancel={vi.fn()} />);
    const input = screen.getByLabelText("Photo name");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("maxLength", "80");
    expect(screen.getByText("Leave blank to use the file name, DSCF1368.JPG.")).toBeInTheDocument();
    await userEvent.type(input, "  Harbor at dusk ");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(onSave).toHaveBeenCalledWith("Harbor at dusk");
  });

  it("clears the name when saved blank", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(<PhotoNameForm fileName="DSCF1368.JPG" initialName="Harbor" onSave={onSave} onCancel={vi.fn()} />);
    const input = screen.getByLabelText("Photo name");
    expect(input).toHaveValue("Harbor");
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("shows why saving failed and keeps the form open", async () => {
    const onSave = vi.fn().mockResolvedValue("Photo names can be up to 80 characters.");
    render(<PhotoNameForm fileName={null} initialName={null} onSave={onSave} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Photo name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Photo names can be up to 80 characters."));
    expect(screen.getByLabelText("Photo name")).toBeInTheDocument();
  });

  it("can be cancelled", async () => {
    const onCancel = vi.fn();
    render(<PhotoNameForm fileName={null} initialName={null} onSave={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
