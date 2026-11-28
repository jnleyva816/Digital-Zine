// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FujiRecipe } from "@/lib/fuji/fuji-recipe";
import type { FoundRecipe } from "@/lib/fuji/fuji-makernote";
import { RecipeEditor } from "./RecipeEditor";

function setup(props: Partial<React.ComponentProps<typeof RecipeEditor>> = {}) {
  const onSave = vi.fn<(r: FujiRecipe | null) => Promise<string | null>>().mockResolvedValue(null);
  const onClose = vi.fn();
  render(<RecipeEditor open assetLabel="DSCF0412.jpg" initial={null} onClose={onClose} onSave={onSave} {...props} />);
  return { onSave, onClose, user: userEvent.setup() };
}

const save = () => screen.getByRole("button", { name: "Save recipe" });

describe("RecipeEditor", () => {
  it("is a labelled dialog naming the photo, with no food fields", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Add a film recipe" })).toBeInTheDocument();
    expect(screen.getByText("DSCF0412.jpg")).toBeInTheDocument();
    expect(screen.queryByLabelText(/ingredient|method|servings/i)).not.toBeInTheDocument();
  });

  it("offers the camera's film simulations and tone steps", () => {
    setup();
    const sims = screen.getByRole("combobox", { name: "Film simulation" });
    expect(sims).toHaveDisplayValue("Choose a film simulation");
    expect(screen.getByRole("option", { name: "Classic Chrome" })).toBeInTheDocument();
    const highlight = screen.getByRole("combobox", { name: "Highlight" });
    const options = Array.from((highlight as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual(["Not set", "-2", "-1.5", "-1", "-0.5", "0", "+0.5", "+1", "+1.5", "+2", "+2.5", "+3", "+3.5", "+4"]);
  });

  it("requires a name and a film simulation", async () => {
    const { onSave, user } = setup();
    await user.click(save());
    expect(screen.getByRole("alert")).toHaveTextContent("Give the recipe a name.");
    await user.type(screen.getByLabelText("Recipe name"), "Kodachrome 64");
    await user.click(save());
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a film simulation.");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves only the settings that were set", async () => {
    const { onSave, user } = setup();
    await user.type(screen.getByLabelText("Recipe name"), "  Kodachrome 64 ");
    await user.selectOptions(screen.getByLabelText("Film simulation"), "Classic Chrome");
    await user.selectOptions(screen.getByLabelText("Dynamic range"), "DR200");
    await user.selectOptions(screen.getByLabelText("Grain effect"), "Weak, Small");
    await user.selectOptions(screen.getByLabelText("White balance"), "Daylight");
    await user.selectOptions(screen.getByLabelText("White balance red shift"), "+2");
    await user.selectOptions(screen.getByLabelText("White balance blue shift"), "-5");
    await user.selectOptions(screen.getByLabelText("Highlight"), "+1.5");
    await user.selectOptions(screen.getByLabelText("Clarity"), "-2");
    await user.selectOptions(screen.getByLabelText("ISO"), "Auto up to ISO 6400");
    await user.selectOptions(screen.getByLabelText("Exposure compensation"), "0");
    await user.selectOptions(screen.getByLabelText("Exposure compensation up to"), "+2/3");
    await user.click(save());
    expect(onSave).toHaveBeenCalledWith({
      name: "Kodachrome 64",
      filmSimulation: "Classic Chrome",
      dynamicRange: "DR200",
      grain: "Weak, Small",
      whiteBalance: { mode: "Daylight", red: 2, blue: -5 },
      highlight: 1.5,
      clarity: -2,
      iso: "Auto up to ISO 6400",
      exposureCompensation: "0 to +2/3",
    });
  });

  it("asks for a Kelvin temperature only with Kelvin white balance, in 10K steps", async () => {
    const { onSave, user } = setup();
    expect(screen.queryByLabelText("Kelvin")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Recipe name"), "Eterna Summer");
    await user.selectOptions(screen.getByLabelText("Film simulation"), "Eterna/Cinema");
    await user.selectOptions(screen.getByLabelText("White balance"), "Kelvin");
    await user.type(screen.getByLabelText("Kelvin"), "5205");
    await user.click(save());
    expect(screen.getByRole("alert")).toHaveTextContent("Kelvin must be 2500K to 10000K, in steps of 10K.");
    expect(onSave).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Kelvin"));
    await user.type(screen.getByLabelText("Kelvin"), "5200");
    await user.click(save());
    expect(onSave).toHaveBeenCalledWith({
      name: "Eterna Summer",
      filmSimulation: "Eterna/Cinema",
      whiteBalance: { mode: "Kelvin", kelvin: 5200, red: 0, blue: 0 },
    });
  });

  it("refuses an exposure range that runs backwards", async () => {
    const { onSave, user } = setup();
    await user.type(screen.getByLabelText("Recipe name"), "Backwards");
    await user.selectOptions(screen.getByLabelText("Film simulation"), "Acros");
    await user.selectOptions(screen.getByLabelText("Exposure compensation"), "+1");
    await user.selectOptions(screen.getByLabelText("Exposure compensation up to"), "0");
    await user.click(save());
    expect(screen.getByRole("alert")).toHaveTextContent("The exposure range has to go from lower to higher.");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("opens an existing recipe with its values, and keeps the dialog open on a server error", async () => {
    const initial: FujiRecipe = {
      name: "Portra 400",
      filmSimulation: "Classic Neg.",
      whiteBalance: { mode: "Kelvin", kelvin: 5500, red: 1, blue: -3 },
      shadow: -0.5,
      exposureCompensation: "+1/3",
    };
    const { onSave, user } = setup({ initial });
    expect(screen.getByRole("dialog", { name: "Edit film recipe" })).toBeInTheDocument();
    expect(screen.getByLabelText("Recipe name")).toHaveValue("Portra 400");
    expect(screen.getByLabelText("Film simulation")).toHaveDisplayValue("Classic Neg.");
    expect(screen.getByLabelText("Kelvin")).toHaveValue(5500);
    expect(screen.getByLabelText("Shadow")).toHaveDisplayValue("-0.5");

    onSave.mockResolvedValueOnce("Asset not found");
    await user.click(save());
    expect(onSave).toHaveBeenCalledWith(initial);
    expect(await screen.findByRole("alert")).toHaveTextContent("Asset not found");
    expect(save()).toBeEnabled();
  });

  it("removes an existing recipe by saving null", async () => {
    const { onSave, user } = setup({ initial: { name: "Portra 400", filmSimulation: "Classic Neg." } });
    await user.click(screen.getByRole("button", { name: "Remove recipe" }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("prefills settings found in the photo, leaves the name empty, and saves only after the creator names it", async () => {
    const prefill: FoundRecipe = {
      filmSimulation: "Classic Chrome",
      dynamicRange: "DR200",
      grain: "Weak, Large",
      colorChrome: "Strong",
      colorChromeFxBlue: "Weak",
      whiteBalance: { mode: "Kelvin", kelvin: 5200, red: 2, blue: -4 },
      highlight: 0.5,
      shadow: -2,
      color: 2,
      sharpness: -1,
      clarity: -3,
      noiseReduction: -4,
    };
    const { onSave, user } = setup({ prefill });

    expect(screen.getByRole("dialog", { name: "Add a film recipe" })).toBeInTheDocument();
    expect(screen.getByText(/found in this photo/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Recipe name")).toHaveValue("");
    expect(screen.getByLabelText("Film simulation")).toHaveDisplayValue("Classic Chrome");
    expect(screen.getByLabelText("Dynamic range")).toHaveDisplayValue("DR200");
    expect(screen.getByLabelText("Grain effect")).toHaveDisplayValue("Weak, Large");
    expect(screen.getByLabelText("Color Chrome Effect")).toHaveDisplayValue("Strong");
    expect(screen.getByLabelText("Color Chrome FX Blue")).toHaveDisplayValue("Weak");
    expect(screen.getByLabelText("White balance")).toHaveDisplayValue("Kelvin");
    expect(screen.getByLabelText("Kelvin")).toHaveValue(5200);
    expect(screen.getByLabelText("White balance red shift")).toHaveDisplayValue("+2");
    expect(screen.getByLabelText("White balance blue shift")).toHaveDisplayValue("-4");
    expect(screen.getByLabelText("Highlight")).toHaveDisplayValue("+0.5");
    expect(screen.getByLabelText("Shadow")).toHaveDisplayValue("-2");
    expect(screen.getByLabelText("Color")).toHaveDisplayValue("+2");
    expect(screen.getByLabelText("Sharpness")).toHaveDisplayValue("-1");
    expect(screen.getByLabelText("Clarity")).toHaveDisplayValue("-3");
    expect(screen.getByLabelText("Noise Reduction")).toHaveDisplayValue("-4");
    expect(screen.queryByRole("button", { name: "Remove recipe" })).not.toBeInTheDocument();

    await user.click(save());
    expect(screen.getByRole("alert")).toHaveTextContent("Give the recipe a name.");
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Recipe name"), "Sunday Chrome");
    await user.click(save());
    expect(onSave).toHaveBeenCalledWith({ name: "Sunday Chrome", ...prefill });
  });
});

describe("RecipeEditor and the saved-recipe library (DIG-24)", () => {
  const kodachrome: FujiRecipe = { name: "Kodachrome 64", filmSimulation: "Classic Chrome", shadow: -1 };
  const agfa: FujiRecipe = { name: "Agfa Vista", filmSimulation: "Classic Neg." };
  const library = [
    { id: "k", recipe: kodachrome, photoCount: 2 },
    { id: "a", recipe: agfa, photoCount: 0 },
  ];

  it("links the photo to a saved recipe picked from the library", async () => {
    const onLink = vi.fn().mockResolvedValue(null);
    const { user } = setup({ savedRecipes: library, onLink });
    await user.selectOptions(screen.getByLabelText("Use a saved recipe"), "Agfa Vista");
    await user.click(screen.getByRole("button", { name: "Use saved recipe" }));
    expect(onLink).toHaveBeenCalledWith("a");
  });

  it("says when the photo uses a saved recipe, and can unlink it", async () => {
    const onLink = vi.fn().mockResolvedValue(null);
    const { user } = setup({ initial: kodachrome, linkedRecipeId: "k", savedRecipes: library, onLink });
    expect(screen.getByText(/Linked to your saved recipe “Kodachrome 64”\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save to library" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    expect(onLink).toHaveBeenCalledWith(null);
  });

  it("saves a photo's own recipe to the library", async () => {
    const onSaveToLibrary = vi.fn().mockResolvedValue(null);
    const { user } = setup({ initial: { name: "My Chrome", filmSimulation: "Classic Chrome" }, savedRecipes: [], onSaveToLibrary });
    await user.click(screen.getByRole("button", { name: "Save to library" }));
    expect(onSaveToLibrary).toHaveBeenCalledWith({ name: "My Chrome", filmSimulation: "Classic Chrome" });
  });

  it("suggests the saved recipe whose settings match those found in the photo", async () => {
    const onLink = vi.fn().mockResolvedValue(null);
    const { name: _name, ...found } = kodachrome;
    const { user } = setup({ prefill: found, savedRecipes: library, onLink });
    expect(screen.getByText("These settings match your saved recipe “Kodachrome 64”.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use Kodachrome 64" }));
    expect(onLink).toHaveBeenCalledWith("k");
  });

  it("shows why a link failed", async () => {
    const onLink = vi.fn().mockResolvedValue("Recipe not found");
    const { user } = setup({ savedRecipes: library, onLink });
    await user.click(screen.getByRole("button", { name: "Use saved recipe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Recipe not found");
  });

  it("can hide Remove, for editing a recipe in the library itself", () => {
    setup({ initial: kodachrome, allowRemove: false });
    expect(screen.queryByRole("button", { name: "Remove recipe" })).not.toBeInTheDocument();
  });
});

