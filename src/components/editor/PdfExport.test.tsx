// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfExport } from "./PdfExport";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:zine-pdf");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("PdfExport", () => {
  it("offers Free creators an upgrade instead of a download", () => {
    render(<PdfExport slug="brine" tier="free" dirty={false} />);
    expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(screen.getByText("PDF export is a Pro feature.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/billing");
  });

  it("downloads the PDF for Pro creators, showing progress while it renders", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<PdfExport slug="brine" tier="pro" dirty={false} />);

    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    const busy = screen.getByRole("button", { name: "Preparing PDF…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(fetchMock).toHaveBeenCalledWith("/api/pdf/brine", expect.objectContaining({ cache: "no-store" }));

    resolve(new Response("%PDF-1.3", { status: 200, headers: { "Content-Type": "application/pdf" } }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("brine.pdf");
    expect(anchor.href).toBe("blob:zine-pdf");
    expect(await screen.findByRole("button", { name: "Download PDF" })).toBeEnabled();
    expect(screen.getByText("PDF downloaded.")).toBeInTheDocument();
  });

  it("shows the server's error and lets the creator retry", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "PDF export is gated to the Pro plan." }, { status: 403 })
    );
    const user = userEvent.setup();
    render(<PdfExport slug="brine" tier="pro" dirty={false} />);
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("PDF export is gated to the Pro plan.");
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  });

  it("explains a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<PdfExport slug="brine" tier="pro" dirty={false} />);
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server. Check your connection and try again.");
  });

  it("warns that unsaved edits are not in the PDF", () => {
    render(<PdfExport slug="brine" tier="pro" dirty />);
    expect(screen.getByText("The PDF uses the last saved version. Save first to include your changes.")).toBeInTheDocument();
  });
});
