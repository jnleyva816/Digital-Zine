// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPdfSettings, type PdfSettings } from "@/lib/pdf/pdf-settings";
import { PdfExport } from "./PdfExport";
import type { PreviewPage, PreviewZine } from "./PdfPagePreview";

vi.mock("./pdf-web-fonts", () => ({ webFontFamily: (family: string) => family }));

const fetchMock = vi.fn<typeof fetch>();
const saves = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").map(([, init]) => JSON.parse(String(init!.body)).pdfSettings as PdfSettings);
const exportsMade = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/pdf/"));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url) =>
    String(url).startsWith("/api/pdf/") ? new Response("%PDF-1.3", { status: 200 }) : Response.json({ zine: {} })
  );
  URL.createObjectURL = vi.fn(() => "blob:zine-pdf");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const page = (n: number, over: Partial<PreviewPage> = {}): PreviewPage => ({
  pageNumber: n,
  assetId: `asset-${n}`,
  name: null,
  caption: `Caption ${n}`,
  photo: { src: `/photo-${n}.jpg`, edit: null, dims: null },
  exif: { aperture: "f/2.8" },
  recipe: null,
  ...over,
});
const recipe = { name: "Kodachrome 64", filmSimulation: "Classic Chrome" as const };
const zine: PreviewZine = {
  title: "Brine & Light",
  description: "Three evenings.",
  authorName: "Sam Ortega",
  publishedAt: "2026-10-20T00:00:00.000Z",
  pages: [page(1), page(2, { recipe }), page(3)],
};

async function open(settings: PdfSettings | null, over: Partial<React.ComponentProps<typeof PdfExport>> = {}) {
  const user = userEvent.setup();
  render(<PdfExport zineId="z1" slug="brine" tier="pro" dirty={false} settings={settings} preview={zine} {...over} />);
  await user.click(screen.getByRole("button", { name: "Style your PDF" }));
  return { user, panel: within(screen.getByRole("dialog", { name: "Style your PDF" })) };
}
const darkroom = defaultPdfSettings("darkroom", "a4");
const option = (panel: ReturnType<typeof within>, group: string, name: RegExp) => within(panel.getByRole("group", { name: group })).getByRole("button", { name });

describe("the first time", () => {
  it("preselects nothing and keeps Export disabled until a template and a paper size are chosen", async () => {
    const { user, panel } = await open(null);
    // The format says which export the panel is about; no style is picked.
    expect(panel.getAllByRole("button", { pressed: true }).map((b) => b.textContent)).toEqual(["Booklet PDF"]);
    expect(panel.getByText("US and Canada")).toBeInTheDocument();
    expect(panel.getByText("Most other countries")).toBeInTheDocument();
    const exportPdf = panel.getByRole("button", { name: "Export PDF" });
    expect(exportPdf).toBeDisabled();
    expect(panel.getByRole("button", { name: "Reset" })).toBeDisabled();

    await user.click(option(panel, "Template", /^Gallery/));
    expect(exportPdf).toBeDisabled();
    await user.click(option(panel, "Paper size", /^Letter/));
    expect(exportPdf).toBeEnabled();
    await waitFor(() => expect(saves()).toEqual([defaultPdfSettings("gallery", "letter")]), { timeout: 2000 });
  });

  it("takes the paper size first just as well", async () => {
    const { user, panel } = await open(null);
    await user.click(option(panel, "Paper size", /^A4/));
    expect(panel.getByRole("button", { name: "Export PDF" })).toBeDisabled();
    await user.click(option(panel, "Template", /^Riso/));
    await waitFor(() => expect(saves()).toEqual([defaultPdfSettings("riso", "a4")]), { timeout: 2000 });
  });

  it("offers no download outside the panel until there is a style", () => {
    render(<PdfExport zineId="z1" slug="brine" tier="pro" dirty={false} settings={null} preview={zine} />);
    expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(screen.getByText("Choose a style before your first PDF.")).toBeInTheDocument();
  });
});

describe("choices", () => {
  it("applies a template's typeface, palette, and card style", async () => {
    const { user, panel } = await open(darkroom);
    await user.click(option(panel, "Template", /^Riso/));
    expect(option(panel, "Template", /^Riso/)).toHaveAttribute("aria-pressed", "true");
    expect(option(panel, "Template", /^Darkroom/)).toHaveAttribute("aria-pressed", "false");
    expect(option(panel, "Typeface", /^Poster/)).toHaveAttribute("aria-pressed", "true");
    expect(option(panel, "Colours", /^Riso/)).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(saves().at(-1)).toMatchObject({ template: "riso", typeface: "poster", palette: "riso", card: { style: "sticker" }, paper: "a4" }), { timeout: 2000 });
  });

  it("keeps the template when the typeface or the colours change, and spells the pair out", async () => {
    const { user, panel } = await open(darkroom);
    expect(panel.getByText("Fraunces headings · Inter text · Plex Mono details")).toBeInTheDocument();
    await user.click(option(panel, "Typeface", /^Typewriter/));
    await user.click(option(panel, "Colours", /^Fog/));
    expect(panel.getByText("Courier Prime throughout")).toBeInTheDocument();
    expect(option(panel, "Template", /^Darkroom/)).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(saves().at(-1)).toEqual({ ...darkroom, typeface: "typewriter", palette: "fog" }), { timeout: 2000 });
  });

  it.each([
    ["Recipe card on photos that have one", "recipeCards"],
    ["Captions", "captions"],
    ["Page numbers", "pageNumbers"],
  ] as const)("turns off “%s”", async (label, key) => {
    const { user, panel } = await open(darkroom);
    expect(panel.getByRole("checkbox", { name: label })).toBeChecked();
    await user.click(panel.getByRole("checkbox", { name: label }));
    expect(panel.getByRole("checkbox", { name: label })).not.toBeChecked();
    await waitFor(() => expect(saves().at(-1)).toEqual({ ...darkroom, [key]: false }), { timeout: 2000 });
  });

  it("resets to the template's defaults, keeping the paper and the mini zine's settings", async () => {
    const mini = { format: "mini" as const, inkSaver: true, miniPhotos: ["asset-2"] };
    const { user, panel } = await open({ ...defaultPdfSettings("contact", "letter"), ...mini, typeface: "poster", captions: false });
    await user.click(panel.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(saves().at(-1)).toEqual({ ...defaultPdfSettings("contact", "letter"), ...mini }), { timeout: 2000 });
  });

  it("leaves out mini zine photos that are no longer on a page, which the server would refuse", async () => {
    const { user, panel } = await open({ ...darkroom, miniPhotos: ["gone", "asset-3"] });
    await user.click(panel.getByRole("checkbox", { name: "Captions" }));
    await waitFor(() => expect(saves().at(-1)?.miniPhotos).toEqual(["asset-3"]), { timeout: 2000 });
  });

  it("works by keyboard, and every group has a heading", async () => {
    const { user, panel } = await open(darkroom);
    for (const name of ["Template", "Paper size", "Typeface", "Colours", "Pages"]) expect(panel.getByRole("heading", { name })).toBeInTheDocument();
    option(panel, "Template", /^Contact Sheet/).focus();
    await user.keyboard(" ");
    expect(option(panel, "Template", /^Contact Sheet/)).toHaveAttribute("aria-pressed", "true");
  });
});

describe("saving and exporting", () => {
  it("exports with the choices just made, saved first", async () => {
    const { user, panel } = await open(darkroom);
    await user.click(option(panel, "Template", /^Gallery/));
    await user.click(panel.getByRole("button", { name: "Export PDF" }));
    await waitFor(() => expect(exportsMade()).toHaveLength(1));
    expect(saves()).toEqual([defaultPdfSettings("gallery", "a4")]);
    expect(fetchMock.mock.calls.map(([, i]) => i?.method ?? "GET")).toEqual(["PATCH", "GET"]);
    expect(await panel.findByText("PDF downloaded.")).toBeInTheDocument();
  });

  it("does not export when the save fails, and saves again on request", async () => {
    fetchMock.mockImplementationOnce(async () => Response.json({ error: "Slow down." }, { status: 429 }));
    const { user, panel } = await open(darkroom);
    await user.click(option(panel, "Template", /^Gallery/));
    await user.click(panel.getByRole("button", { name: "Export PDF" }));
    expect(await panel.findByRole("alert")).toHaveTextContent("Slow down.");
    expect(exportsMade()).toEqual([]);
    await user.click(panel.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(saves()).toHaveLength(2));
    await waitFor(() => expect(panel.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("saves a choice made just before closing", async () => {
    const { user, panel } = await open(darkroom);
    await user.click(option(panel, "Colours", /^Paper/));
    await user.click(panel.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(saves()).toEqual([{ ...darkroom, palette: "paper" }]), { timeout: 300 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lets a Free creator style and preview, with the upgrade prompt in place of Export", async () => {
    const { user, panel } = await open(null, { tier: "free" });
    expect(panel.queryByRole("button", { name: "Export PDF" })).not.toBeInTheDocument();
    expect(panel.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/billing");
    await user.click(option(panel, "Template", /^Darkroom/));
    expect(panel.getByRole("img", { name: "Cover" })).toBeInTheDocument();
    await user.click(option(panel, "Paper size", /^A4/));
    await waitFor(() => expect(saves()).toHaveLength(1), { timeout: 2000 });
  });
});

describe("preview", () => {
  it("asks for a template before there is anything to draw", async () => {
    const { panel } = await open(null);
    expect(panel.queryByRole("img")).not.toBeInTheDocument();
    expect(panel.getByText("Pick a template to see your zine in it.")).toBeInTheDocument();
  });

  it("draws the cover, a photo with its recipe card, and a photo without one, from the zine's own text", async () => {
    const { panel } = await open(darkroom);
    expect(panel.getByRole("img", { name: "Cover" })).toHaveTextContent("Brine & Light");
    const card = panel.getByRole("img", { name: "Photo with a recipe card" });
    expect(card).toHaveTextContent("Kodachrome 64");
    expect(card).toHaveTextContent("Caption 2");
    expect(card).toHaveTextContent("02 / 03");
    const plain = panel.getByRole("img", { name: "Photo without a recipe" });
    expect(plain).toHaveTextContent("Caption 1");
    expect(plain).not.toHaveTextContent("Kodachrome 64");
  });

  it("follows each change at once", async () => {
    const { user, panel } = await open(darkroom);
    const card = () => panel.getByRole("img", { name: "Photo with a recipe card" });
    await user.click(panel.getByRole("checkbox", { name: "Captions" }));
    expect(card()).not.toHaveTextContent("Caption 2");
    await user.click(panel.getByRole("checkbox", { name: "Recipe card on photos that have one" }));
    expect(card()).not.toHaveTextContent("Kodachrome 64");
    await user.click(option(panel, "Colours", /^Paper/));
    expect(card()).toHaveStyle({ backgroundColor: "#FDFBF7" });
  });

  it.each(["contact", "gallery", "riso"] as const)("draws %s", async (template) => {
    const { panel } = await open(defaultPdfSettings(template, "letter"));
    expect(panel.getByRole("img", { name: "Cover" })).toHaveTextContent("Brine & Light");
    expect(panel.getByRole("img", { name: "Photo with a recipe card" })).toHaveTextContent("Kodachrome 64");
  });

  it("says so when no photo has a recipe, or every photo has one", async () => {
    const { panel } = await open(darkroom, { preview: { ...zine, pages: [page(1)] } });
    expect(panel.getByText("No photo in this zine has a recipe on its card.")).toBeInTheDocument();
  });

  it("says so when the zine has no pages", async () => {
    const { panel } = await open(darkroom, { preview: { ...zine, pages: [] } });
    expect(panel.getByText("Add a page and save to see a preview.")).toBeInTheDocument();
  });
});

describe("cover (DIG-126)", () => {
  const cover = (panel: ReturnType<typeof within>) => panel.getByRole("img", { name: "Cover" });
  const photos = (panel: ReturnType<typeof within>) => cover(panel).querySelectorAll("img").length;
  const picker = (panel: ReturnType<typeof within>) => panel.queryByRole("group", { name: "Cover photo" });

  it("starts as the title only, and offers no photo to pick", async () => {
    const { panel } = await open(darkroom);
    expect(option(panel, "Cover", /^Title only/)).toHaveAttribute("aria-pressed", "true");
    expect(photos(panel)).toBe(0);
    expect(picker(panel)).not.toBeInTheDocument();
  });

  it("waits for a template", async () => {
    const { panel } = await open(null);
    expect(option(panel, "Cover", /^Photo grid/)).toBeDisabled();
  });

  it.each([
    [/^Template cover/, "template", 1],
    [/^Full-page photo/, "full", 1],
    [/^Photo grid/, "grid", 3],
  ] as const)("saves and previews %s", async (name, style, count) => {
    const { user, panel } = await open(darkroom);
    await user.click(option(panel, "Cover", name));
    expect(photos(panel)).toBe(count);
    expect(cover(panel)).toHaveTextContent("Brine & Light");
    await waitFor(() => expect(saves().at(-1)).toEqual({ ...darkroom, cover: { style, photo: null } }), { timeout: 2000 });
  });

  it("takes any photo in the zine, starting from the first", async () => {
    const { user, panel } = await open({ ...darkroom, cover: { style: "full", photo: null } });
    const choices = within(picker(panel)!);
    expect(choices.getByRole("button", { name: "Caption 1" })).toHaveAttribute("aria-pressed", "true");
    await user.click(choices.getByRole("button", { name: "Caption 3" }));
    expect(choices.getByRole("button", { name: "Caption 3" })).toHaveAttribute("aria-pressed", "true");
    expect(decodeURIComponent(cover(panel).querySelector("img")!.getAttribute("src")!)).toContain("/photo-3.jpg");
    await waitFor(() => expect(saves().at(-1)).toEqual({ ...darkroom, cover: { style: "full", photo: "asset-3" } }), { timeout: 2000 });
  });

  it("lists a photo used on two pages once", async () => {
    const { panel } = await open({ ...darkroom, cover: { style: "full", photo: null } }, { preview: { ...zine, pages: [page(1), page(2, { assetId: "asset-1" })] } });
    expect(within(picker(panel)!).getAllByRole("button")).toHaveLength(1);
  });

  it("shows the first photo, and saves none, when the chosen one has left the zine", async () => {
    const { user, panel } = await open({ ...darkroom, cover: { style: "full", photo: "gone" } });
    expect(within(picker(panel)!).getByRole("button", { name: "Caption 1" })).toHaveAttribute("aria-pressed", "true");
    await user.click(panel.getByRole("checkbox", { name: "Captions" }));
    await waitFor(() => expect(saves().at(-1)?.cover).toEqual({ style: "full", photo: null }), { timeout: 2000 });
  });

  it("goes back to the title only on Reset", async () => {
    const { user, panel } = await open({ ...darkroom, cover: { style: "grid", photo: null } });
    await user.click(panel.getByRole("button", { name: "Reset" }));
    expect(option(panel, "Cover", /^Title only/)).toHaveAttribute("aria-pressed", "true");
  });
});
