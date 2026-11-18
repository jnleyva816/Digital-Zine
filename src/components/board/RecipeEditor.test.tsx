// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecipeEditor } from "./RecipeEditor";

function setup(props: Partial<React.ComponentProps<typeof RecipeEditor>> = {}) {
  const onSave = vi.fn<(r: unknown) => Promise<string | null>>().mockResolvedValue(null);
  const onClose = vi.fn();
  render(
    <RecipeEditor open assetLabel="cellar.jpg" initial={null} onClose={onClose} onSave={onSave} {...props} />
  );
  return { onSave, onClose, user: userEvent.setup() };
}

describe("RecipeEditor", () => {
  it("is a labelled dialog naming the photo", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Add a recipe" })).toBeInTheDocument();
    expect(screen.getByText("cellar.jpg")).toBeInTheDocument();
  });

  it("rejects an empty recipe without calling the server", async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add a title, at least one ingredient, or at least one step.");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("trims fields and splits ingredients and method by line", async () => {
    const { onSave, user } = setup();
    await user.type(screen.getByLabelText("Title"), "  Kraut ");
    await user.type(screen.getByLabelText("Ingredients"), "1 cabbage{Enter}{Enter}  2% salt {Enter}");
    await user.type(screen.getByLabelText("Method"), "Shred.{Enter}Pack.");
    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(onSave).toHaveBeenCalledWith({
      title: "Kraut",
      ingredients: ["1 cabbage", "2% salt"],
      method: ["Shred.", "Pack."],
    });
  });

  it("enforces the API's ingredient limit", async () => {
    const { onSave, user } = setup({ initial: { title: "Big", ingredients: Array.from({ length: 51 }, (_, i) => `i${i}`), method: [] } });
    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Use at most 50 ingredients.");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the server's error and keeps the dialog open", async () => {
    const { onSave, user } = setup({ initial: { title: "Kraut", ingredients: [], method: [] } });
    onSave.mockResolvedValueOnce("Asset not found");
    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Asset not found");
    expect(screen.getByRole("dialog", { name: "Edit recipe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save recipe" })).toBeEnabled();
  });

  it("removes an existing recipe by saving null", async () => {
    const { onSave, user } = setup({ initial: { title: "Kraut", ingredients: ["cabbage"], method: [] } });
    await user.click(screen.getByRole("button", { name: "Remove recipe" }));
    expect(onSave).toHaveBeenCalledWith(null);
  });
});
