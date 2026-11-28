// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedRecipe } from "@/lib/fuji/recipe-library";
import { RecipeLibrary } from "./RecipeLibrary";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockReset();
});

const kodachrome: SavedRecipe = { id: "k", recipe: { name: "Kodachrome 64", filmSimulation: "Classic Chrome" }, photoCount: 2 };
const rows = () => within(screen.getByRole("list", { name: "Saved recipes" })).getAllByRole("listitem");
const lastBody = () => JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body ?? "null")) as unknown;

describe("RecipeLibrary (DIG-24)", () => {
  it("lists saved recipes with their film simulation and how many photos use them", () => {
    render(<RecipeLibrary initial={[kodachrome, { id: "a", recipe: { name: "Agfa", filmSimulation: "Classic Neg." }, photoCount: 1 }]} />);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent("Kodachrome 64");
    expect(rows()[0]).toHaveTextContent("Classic Chrome");
    expect(rows()[0]).toHaveTextContent("Used on 2 photos");
    expect(rows()[1]).toHaveTextContent("Used on 1 photo");
  });

  it("explains the library when it is empty", () => {
    render(<RecipeLibrary initial={[]} />);
    expect(screen.getByRole("heading", { name: "No saved recipes yet" })).toBeInTheDocument();
  });

  it("saves a new recipe and adds it to the list", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ recipe: { id: "n", recipe: { name: "Portra 400", filmSimulation: "Classic Neg." }, photoCount: 0 } }, { status: 201 })
    );
    render(<RecipeLibrary initial={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "New recipe" }));
    const dialog = screen.getByRole("dialog", { name: "Add a film recipe" });
    await userEvent.type(within(dialog).getByLabelText("Recipe name"), "Portra 400");
    await userEvent.selectOptions(within(dialog).getByLabelText("Film simulation"), "Classic Neg.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/recipes", expect.objectContaining({ method: "POST" }));
    expect(lastBody()).toEqual({ recipe: { name: "Portra 400", filmSimulation: "Classic Neg." } });
  });

  it("edits a recipe, which says it changes every photo using it", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ recipe: { id: "k", recipe: { name: "Kodachrome 25", filmSimulation: "Classic Chrome" }, photoCount: 2 } })
    );
    render(<RecipeLibrary initial={[kodachrome]} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Kodachrome 64" }));
    const dialog = screen.getByRole("dialog", { name: "Edit film recipe" });
    expect(within(dialog).getByText("Saving changes this recipe on 2 photos.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Remove recipe" })).not.toBeInTheDocument();
    const name = within(dialog).getByLabelText("Recipe name");
    await userEvent.clear(name);
    await userEvent.type(name, "Kodachrome 25");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(rows()[0]).toHaveTextContent("Kodachrome 25"));
    expect(fetchMock).toHaveBeenCalledWith("/api/recipes/k", expect.objectContaining({ method: "PATCH" }));
  });

  it("shows the server's reason, such as a duplicate name, and keeps the dialog open", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "You already have a recipe named “Agfa”." }, { status: 409 }));
    render(<RecipeLibrary initial={[kodachrome]} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Kodachrome 64" }));
    await userEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You already have a recipe named “Agfa”.");
  });

  it("deletes a recipe after saying its photos keep a copy", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    render(<RecipeLibrary initial={[kodachrome]} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete Kodachrome 64" }));
    expect(screen.getByText("Its 2 photos keep a copy of the settings.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete recipe" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "No saved recipes yet" })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/recipes/k", expect.objectContaining({ method: "DELETE" }));
  });
});
