import { describe, expect, it } from "vitest";
import { shareDescription } from "./public-zine";

describe("shareDescription", () => {
  it("uses the zine's own description, trimmed", () => {
    expect(shareDescription({ description: "  Three plates.  ", ownerName: "Mara", pageCount: 3 })).toBe("Three plates.");
  });

  it("falls back to a byline and page count", () => {
    expect(shareDescription({ description: null, ownerName: "Mara Ito", pageCount: 3 })).toBe(
      "A digital zine by Mara Ito · 3 pages"
    );
    expect(shareDescription({ description: "   ", ownerName: "Mara Ito", pageCount: 1 })).toBe(
      "A digital zine by Mara Ito · 1 page"
    );
  });

  it("leaves the creator out when they have no display name", () => {
    expect(shareDescription({ description: null, ownerName: null, pageCount: 2 })).toBe("A digital zine · 2 pages");
    expect(shareDescription({ description: null, ownerName: "  ", pageCount: 2 })).toBe("A digital zine · 2 pages");
  });

  it("caps long descriptions at 200 characters for share cards", () => {
    const out = shareDescription({ description: "a".repeat(400), ownerName: null, pageCount: 1 });
    expect(out).toHaveLength(200);
    expect(out.endsWith("…")).toBe(true);
  });
});
