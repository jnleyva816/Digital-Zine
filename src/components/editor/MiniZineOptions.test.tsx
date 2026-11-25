// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPdfSettings, type PdfSettings } from "@/lib/pdf-settings";
import { PdfExport } from "./PdfExport";
import type { PreviewPage, PreviewZine } from "./PdfPagePreview";

vi.mock("./pdf-web-fonts", () => ({ webFontFamily: (family: string) => family }));

const fetchMock = vi.fn<typeof fetch>();
const saves = () => fetchMock.mock.calls.filter(([, i]) => i?.method === "PATCH").map(([, i]) => JSON.parse(String(i!.body)).pdfSettings as PdfSettings);
const exportsMade = () => fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/pdf/"));
let downloads: string[] = [];

beforeEach(() => {
  downloads = [];
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url) => (String(url).startsWith("/api/pdf/") ? new Response("%PDF-1.3") : Response.json({ zine: {} })));
  URL.createObjectURL = vi.fn(() => "blob:zine-pdf");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const recipe = { name: "Harbor Chrome", filmSimulation: "Classic Chrome" as const };
const page = (n: number, over: Partial<PreviewPage> = {}): PreviewPage => ({
  pageNumber: n,
  assetId: `a${n}`,
  name: `Photo ${n}`,
  caption: "",
  photo: { src: `/photo-${n}.jpg`, edit: null, dims: null },
  exif: null,
  recipe: null,
  ...over,
});
const pages = (count: number, over: Partial<PreviewPage> = {}) => Array.from({ length: count }, (_, i) => page(i + 1, over));
const zine = (list: PreviewPage[]): PreviewZine => ({ title: "Brine", description: null, authorName: null, publishedAt: "2026-10-20T00:00:00.000Z", pages: list });
const mini: PdfSettings = { ...defaultPdfSettings("darkroom", "a4"), format: "mini" };

async function open(settings: PdfSettings | null, list: PreviewPage[], tier: "free" | "pro" = "free") {
  const user = userEvent.setup();
  render(<PdfExport zineId="z1" slug="brine" tier={tier} dirty={false} settings={settings} preview={zine(list)} />);
  await user.click(screen.getByRole("button", { name: "Style your PDF" }));
  const panel = within(screen.getByRole("dialog", { name: "Style your PDF" }));
  const slots = () => within(panel.getByRole("list", { name: "Mini zine photos" })).getAllByRole("img").map((i) => i.getAttribute("alt"));
  const order = () => within(panel.getByRole("list", { name: "Reading order once folded" })).getAllByRole("listitem").map((li) => li.textContent);
  const saved = (part: Partial<PdfSettings>) => waitFor(() => expect(saves().at(-1)).toEqual({ ...settings, ...part }), { timeout: 2000 });
  return { user, panel, slots, order, saved };
}

describe("format", () => {
  it("switches between the booklet and the mini zine, and saves it", async () => {
    const { user, panel, saved } = await open({ ...mini, format: "booklet" }, pages(5));
    expect(panel.getByRole("button", { name: "Booklet PDF" })).toHaveAttribute("aria-pressed", "true");
    expect(panel.queryByText(/Prints on one Letter or A4 sheet/)).not.toBeInTheDocument();
    await user.click(panel.getByRole("button", { name: "Mini zine (1 sheet)" }));
    expect(panel.getByText("Prints on one Letter or A4 sheet. Fold it, make one cut, and it becomes an 8-page booklet.")).toBeInTheDocument();
    expect(panel.queryByRole("img", { name: "Cover" })).not.toBeInTheDocument();
    expect(panel.getByRole("group", { name: "Paper size" })).toBeInTheDocument();
    await saved({ format: "mini" });
  });

  it("keeps the format chosen before the first template and paper size", async () => {
    const { user, panel } = await open(null, pages(5));
    await user.click(panel.getByRole("button", { name: "Mini zine (1 sheet)" }));
    expect(panel.getByRole("button", { name: "Download print sheet" })).toBeDisabled();
    await user.click(panel.getByRole("button", { name: /^Letter/ }));
    await user.click(panel.getByRole("button", { name: /^Riso\s*Two/ }));
    expect(panel.getByRole("button", { name: "Download print sheet" })).toBeEnabled();
    await waitFor(() => expect(saves().at(-1)).toEqual({ ...defaultPdfSettings("riso", "letter"), format: "mini" }), { timeout: 2000 });
  });
});

describe("photos", () => {
  it("starts with the zine's first six, with their page numbers", async () => {
    const { panel, slots } = await open(mini, pages(8));
    expect(panel.getByText("6 of 6")).toBeInTheDocument();
    expect(slots()).toEqual(["Page 2: Photo 1", "Page 3: Photo 2", "Page 4: Photo 3", "Page 5: Photo 4", "Page 6: Photo 5", "Page 7: Photo 6"]);
  });

  it("numbers from page 3 when there is an intro", async () => {
    const { panel, slots } = await open(mini, pages(4));
    expect(panel.getByText("4 of 6")).toBeInTheDocument();
    expect(slots()[0]).toBe("Page 3: Photo 1");
    expect(panel.getByText("Cover, back and up to 6 photos. Fewer than 6 frees pages for an intro and a recipe page. A longer zine uses its first 6 photos unless you pick others.")).toBeInTheDocument();
  });

  it("cannot take a seventh photo, and says why", async () => {
    const { user, panel, saved } = await open(mini, pages(8));
    expect(panel.queryByRole("button", { name: "Add photo" })).not.toBeInTheDocument();
    expect(panel.getByText("The mini zine holds 6 photos. Remove one to add another.")).toBeInTheDocument();

    await user.click(panel.getByRole("button", { name: "Remove Photo 2" }));
    expect(panel.getByText("5 of 6")).toBeInTheDocument();
    await user.click(panel.getByRole("button", { name: "Add photo" }));
    const picker = within(panel.getByRole("group", { name: "Add a photo" }));
    expect(picker.getAllByRole("button", { name: /^Add Photo/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Add Photo 2", "Add Photo 7", "Add Photo 8"]);
    await user.click(picker.getByRole("button", { name: "Add Photo 8" }));
    expect(panel.queryByRole("group", { name: "Add a photo" })).not.toBeInTheDocument();
    expect(panel.queryByRole("button", { name: "Add photo" })).not.toBeInTheDocument();
    await saved({ miniPhotos: ["a1", "a3", "a4", "a5", "a6", "a8"] });
  });

  it("reorders, by buttons that keep their place in the tab order", async () => {
    const { user, panel, slots, saved } = await open(mini, pages(6));
    await user.click(panel.getByRole("button", { name: "Move Photo 1 later" }));
    expect(slots().slice(0, 2)).toEqual(["Page 2: Photo 2", "Page 3: Photo 1"]);
    expect(panel.getByRole("button", { name: "Move Photo 1 later" })).toHaveFocus();
    await user.click(panel.getByRole("button", { name: "Move Photo 6 earlier" }));
    await saved({ miniPhotos: ["a2", "a1", "a3", "a4", "a6", "a5"] });
    await user.click(panel.getByRole("button", { name: "Move Photo 2 earlier" }));
    expect(slots()[0]).toBe("Page 2: Photo 2");
  });

  it("uses the creator's own choice, and drops photos that have left the zine", async () => {
    const { slots } = await open({ ...mini, miniPhotos: ["a5", "gone", "a2"] }, pages(6));
    expect(slots().map((s) => s?.split(": ")[1])).toEqual(["Photo 5", "Photo 2"]);
  });

  it("lists a photo used on two pages once when it is added or moved", async () => {
    const { user, panel, saved } = await open(mini, [...pages(4), page(5, { assetId: "a1", name: "Photo 1" })]);
    await user.click(panel.getByRole("button", { name: "Move Photo 2 later" }));
    await saved({ miniPhotos: ["a1", "a3", "a2", "a4"] });
  });

  it("needs at least four to download", async () => {
    const { user, panel } = await open(mini, pages(4));
    const download = panel.getByRole("button", { name: "Download print sheet" });
    expect(download).toBeEnabled();
    await user.click(panel.getByRole("button", { name: "Remove Photo 4" }));
    expect(download).toBeDisabled();
    expect(panel.getByText("A mini zine needs at least 4 photos.")).toBeInTheDocument();
  });

  it("never empties, because an empty choice means the first six", async () => {
    const { panel } = await open({ ...mini, miniPhotos: ["a3"] }, pages(6));
    expect(panel.getByRole("button", { name: "Remove Photo 3" })).toBeDisabled();
  });
});

describe("options", () => {
  it.each([
    ["Recipe page (uses a free page)", "recipePage"],
    ["Fold and cut guides", "guides"],
    ["Ink saver (light pages, even on dark templates)", "inkSaver"],
  ] as const)("toggles “%s”", async (label, key) => {
    const { user, panel, saved } = await open(mini, pages(4));
    await user.click(panel.getByRole("checkbox", { name: label }));
    await saved({ [key]: !mini[key] });
  });
});

describe("reading order", () => {
  it("shows the eight pages as they read once folded", async () => {
    const { user, panel, order } = await open(mini, pages(4, { recipe }));
    expect(order()).toEqual(["CoverTitle, byline", "2Intro (free page)", "3Photo", "4Photo", "5Photo", "6Photo", "7Recipes (free page)", "BackLink to the online zine"]);
    await user.click(panel.getByRole("checkbox", { name: /^Recipe page/ }));
    expect(order()[6]).toBe("7Blank");
  });
});

describe("folding and downloading", () => {
  it("has the six steps as text, and links to the same steps on their own page", async () => {
    const { panel } = await open(mini, pages(4));
    expect(panel.getByRole("heading", { name: "How to fold it" })).toBeInTheDocument();
    const steps = within(panel.getByRole("list", { name: "How to fold it" })).getAllByRole("listitem");
    expect(steps).toHaveLength(6);
    expect(steps[3]).toHaveTextContent("4. Fold in half the short way and cut along the middle crease, from the fold to the centre (the solid line).");
    const link = panel.getByRole("link", { name: /Folding steps/ });
    expect(link).toHaveAttribute("href", "/help/mini-zine");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("downloads the print sheet for a Free creator, with no upgrade prompt, saved first", async () => {
    const { user, panel } = await open(mini, pages(5));
    expect(panel.queryByText("PDF export is a Pro feature.")).not.toBeInTheDocument();
    await user.click(panel.getByRole("checkbox", { name: /^Ink saver/ }));
    await user.click(panel.getByRole("button", { name: "Download print sheet" }));
    await waitFor(() => expect(exportsMade()).toEqual(["/api/pdf/brine?format=mini"]));
    expect(saves()).toEqual([{ ...mini, inkSaver: true }]);
    await waitFor(() => expect(downloads).toEqual(["brine-mini.pdf"]));
    expect(await panel.findByText("Print sheet downloaded.")).toBeInTheDocument();
  });

  it("offers the zine's own format outside the panel", async () => {
    const user = userEvent.setup();
    render(<PdfExport zineId="z1" slug="brine" tier="free" dirty={false} settings={mini} preview={zine(pages(5))} />);
    expect(screen.queryByText("PDF export is a Pro feature.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download print sheet" }));
    await waitFor(() => expect(exportsMade()).toEqual(["/api/pdf/brine?format=mini"]));
  });
});
