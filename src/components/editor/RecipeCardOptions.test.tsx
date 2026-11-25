// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPdfSettings, type PdfSettings } from "@/lib/pdf-settings";
import { PdfExport } from "./PdfExport";
import type { PreviewPage, PreviewZine } from "./PdfPagePreview";

vi.mock("./pdf-web-fonts", () => ({ webFontFamily: (family: string) => family }));

const fetchMock = vi.fn<typeof fetch>();
const lastSave = () => JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body ?? "{}")).pdfSettings as PdfSettings | undefined;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => Response.json({ zine: {} }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const recipe = { name: "Harbor Chrome", filmSimulation: "Classic Chrome" as const, dynamicRange: "DR200" as const, sharpness: 1 };
const page = (n: number, over: Partial<PreviewPage> = {}): PreviewPage => ({
  pageNumber: n,
  assetId: `asset-${n}`,
  name: null,
  caption: `Caption ${n}`,
  photo: { src: `/photo-${n}.jpg`, edit: null, dims: null },
  exif: { aperture: "f/2.8", shutterSpeed: "1/250s", iso: 400 },
  recipe: null,
  ...over,
});
const zine = (pages: PreviewPage[]): PreviewZine => ({ title: "Brine", description: null, authorName: null, publishedAt: "2026-10-20T00:00:00.000Z", pages });
const darkroom = defaultPdfSettings("darkroom", "a4");

async function open(settings: PdfSettings | null = darkroom, pages = [page(1), page(2, { recipe })]) {
  const user = userEvent.setup();
  render(<PdfExport zineId="z1" slug="brine" tier="pro" dirty={false} settings={settings} preview={zine(pages)} />);
  await user.click(screen.getByRole("button", { name: "Style your PDF" }));
  const panel = within(screen.getByRole("dialog", { name: "Style your PDF" }));
  const link = panel.getByRole("button", { name: "Recipe card options" });
  if (settings) await user.click(link);
  const choose = (group: string, name: string | RegExp) => user.click(within(panel.getByRole("group", { name: group })).getByRole("button", { name }));
  const saved = (card: Partial<PdfSettings["card"]>) =>
    waitFor(() => expect(lastSave()).toEqual({ ...settings, card: { ...settings!.card, ...card } }), { timeout: 2000 });
  return { user, panel, link, choose, saved, card: () => panel.getByRole("img", { name: "Photo page with its recipe card" }) };
}

describe("RecipeCardOptions", () => {
  it("opens from the style panel and goes back to it", async () => {
    const { user, panel } = await open();
    expect(panel.getByRole("heading", { name: "Recipe card" })).toHaveFocus();
    expect(panel.getByText("Shown on photos that have a Fujifilm recipe. Applies to every page.")).toBeInTheDocument();
    expect(panel.queryByRole("group", { name: "Template" })).not.toBeInTheDocument();
    await user.click(panel.getByRole("button", { name: "Back to style" }));
    expect(panel.getByRole("group", { name: "Template" })).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Recipe card options" })).toHaveFocus();
  });

  it("waits for a template", async () => {
    const { link } = await open(null);
    expect(link).toBeDisabled();
  });

  it("starts from the zine's card", async () => {
    const { panel } = await open();
    for (const [group, name] of [["Style", "Outline"], ["Size", /^Standard/], ["Location", "Beside the caption"]] as const) {
      expect(within(panel.getByRole("group", { name: group })).getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    }
    expect(panel.getByRole("checkbox", { name: "Recipe name" })).toBeChecked();
    expect(panel.getByRole("checkbox", { name: "Camera settings on the card (f-stop, shutter, ISO)" })).not.toBeChecked();
  });

  it.each([
    ["Outline", "outline"],
    ["Lab label", "label"],
    ["Wall label", "wall"],
    ["Sticker", "sticker"],
    ["One line", "line"],
  ] as const)("saves the %s style", async (name, style) => {
    const { choose, saved } = await open({ ...darkroom, card: { ...darkroom.card, style: style === "line" ? "outline" : "line" } });
    await choose("Style", name);
    await saved({ style });
  });

  it.each([
    [/^Compact\s*3 settings/, "compact"],
    [/^Full\s*All 14/, "full"],
  ] as const)("saves size %s", async (name, size) => {
    const { choose, saved } = await open();
    await choose("Size", name);
    await saved({ size });
  });

  it.each([
    ["On photo, top left", "over-tl"],
    ["On photo, top right", "over-tr"],
    ["On photo, bottom right", "over-br"],
    ["On photo, bottom left", "over-bl"],
    ["Under the caption", "under-caption"],
  ] as const)("saves %s", async (name, location) => {
    const { choose, saved } = await open();
    await choose("Location", name);
    await saved({ location });
  });

  it("turns the name and the camera settings on and off, in the preview too", async () => {
    const { user, panel, saved, card } = await open();
    expect(card()).toHaveTextContent("Harbor Chrome");
    await user.click(panel.getByRole("checkbox", { name: "Recipe name" }));
    await user.click(panel.getByRole("checkbox", { name: /^Camera settings/ }));
    expect(card()).not.toHaveTextContent("Harbor Chrome");
    expect(card()).toHaveTextContent("f/2.8 · 1/250s · ISO 400");
    await saved({ showName: false, showExif: true });
  });

  it("follows the size in the preview", async () => {
    const { choose, card } = await open();
    expect(card()).not.toHaveTextContent("Sharp");
    await choose("Size", /^Full/);
    expect(card()).toHaveTextContent("Sharp");
  });

  it("warns, without refusing, when a full card is on the photo", async () => {
    const { panel, choose, saved } = await open();
    const note = "A full recipe on top of the photo hides a lot of it. Below the photo works better at this size.";
    const status = panel.getByRole("status");
    await choose("Size", /^Full/);
    expect(status).toBeEmptyDOMElement();
    await choose("Location", "On photo, top left");
    expect(status).toHaveTextContent(note);
    await saved({ size: "full", location: "over-tl" });
    // One line hides little.
    await choose("Style", "One line");
    expect(status).toBeEmptyDOMElement();
  });

  it("previews on a dark or a light page, from the zine's palette at first, without saving it", async () => {
    const { user, panel, card } = await open();
    expect(panel.getByRole("button", { name: "Dark page" })).toHaveAttribute("aria-pressed", "true");
    expect(card()).toHaveStyle({ backgroundColor: "#161412" });
    await user.click(panel.getByRole("button", { name: "Light page" }));
    expect(card()).toHaveStyle({ backgroundColor: "#FDFBF7" });
    await user.click(panel.getByRole("button", { name: "Back to style" }));
    expect(panel.getByRole("img", { name: "Cover" })).toHaveStyle({ backgroundColor: "#161412" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the zine's own light palette for a light page", async () => {
    const { panel, card } = await open({ ...darkroom, palette: "fog" });
    expect(panel.getByRole("button", { name: "Light page" })).toHaveAttribute("aria-pressed", "true");
    expect(card()).toHaveStyle({ backgroundColor: "#E4E8E2" });
  });

  it("says when no photo has a recipe, and shows a sample", async () => {
    const { panel, card } = await open(darkroom, [page(1)]);
    expect(panel.getByText("No photo in this zine has a recipe on its card, so this is a sample.")).toBeInTheDocument();
    expect(card()).toHaveTextContent("Sample recipe");
  });

  it("says when recipe cards are off, and turns them on", async () => {
    const { user, panel, card } = await open({ ...darkroom, recipeCards: false });
    expect(card()).toHaveTextContent("Harbor Chrome");
    expect(panel.getByText(/Recipe cards are off, so none will print\./)).toBeInTheDocument();
    await user.click(panel.getByRole("button", { name: "Turn them on" }));
    await waitFor(() => expect(lastSave()?.recipeCards).toBe(true), { timeout: 2000 });
    expect(panel.queryByText(/Recipe cards are off/)).not.toBeInTheDocument();
  });
});
