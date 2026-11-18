import { describe, expect, it } from "vitest";
import {
  addPage,
  canPublish,
  draftFromZine,
  isDirty,
  movePage,
  removePage,
  toSavePayload,
  updatePage,
  validateDraft,
  type EditorDraft,
} from "./editor-state";

const apiZine = {
  title: "Sunday Ferments",
  description: null,
  slug: "sunday-ferments",
  pages: [
    { pageNumber: 2, flipEnabled: false, content: { assetId: "b", caption: "Second" } },
    { pageNumber: 1, flipEnabled: true, content: { assetId: "a" } },
  ],
};

function draft(overrides: Partial<EditorDraft> = {}): EditorDraft {
  return { ...draftFromZine(apiZine), ...overrides };
}

describe("draftFromZine", () => {
  it("orders pages by page number and fills missing fields", () => {
    const d = draftFromZine(apiZine);
    expect(d).toMatchObject({ title: "Sunday Ferments", description: "", slug: "sunday-ferments" });
    expect(d.pages.map(({ assetId, caption, flipEnabled }) => ({ assetId, caption, flipEnabled }))).toEqual([
      { assetId: "a", caption: "", flipEnabled: true },
      { assetId: "b", caption: "Second", flipEnabled: false },
    ]);
  });

  it("gives every page a unique key, even when a photo repeats", () => {
    const d = draftFromZine({
      ...apiZine,
      pages: [
        { pageNumber: 1, flipEnabled: true, content: { assetId: "a" } },
        { pageNumber: 2, flipEnabled: true, content: { assetId: "a" } },
      ],
    });
    expect(new Set(d.pages.map((p) => p.key)).size).toBe(2);
  });
});

describe("page operations", () => {
  it("adds a page at the end with flip on and no caption", () => {
    const pages = addPage(draft().pages, "c");
    expect(pages).toHaveLength(3);
    expect(pages[2]).toMatchObject({ assetId: "c", caption: "", flipEnabled: true });
    expect(new Set(pages.map((p) => p.key)).size).toBe(3);
  });

  it("moves, updates, and removes pages without mutating the input", () => {
    const original = draft().pages;
    const [first, second] = original;
    expect(movePage(original, 0, 1).map((p) => p.assetId)).toEqual(["b", "a"]);
    expect(updatePage(original, second.key, { caption: "New" })[1].caption).toBe("New");
    expect(removePage(original, first.key).map((p) => p.assetId)).toEqual(["b"]);
    expect(original.map((p) => p.assetId)).toEqual(["a", "b"]);
    expect(original[1].caption).toBe("Second");
  });

  it("ignores moves outside the list", () => {
    const pages = draft().pages;
    expect(movePage(pages, 0, -1)).toEqual(pages);
    expect(movePage(pages, 1, 2)).toEqual(pages);
  });
});

describe("isDirty", () => {
  it("is false for an untouched draft and true after any edit", () => {
    const saved = draft();
    expect(isDirty(saved, { ...saved })).toBe(false);
    expect(isDirty(saved, { ...saved, title: "Changed" })).toBe(true);
    expect(isDirty(saved, { ...saved, pages: movePage(saved.pages, 0, 1) })).toBe(true);
    expect(isDirty(saved, { ...saved, pages: updatePage(saved.pages, saved.pages[0].key, { flipEnabled: false }) })).toBe(true);
  });

  it("ignores page keys, which are local only", () => {
    const saved = draft();
    const reloaded = draftFromZine(apiZine);
    expect(isDirty(saved, reloaded)).toBe(false);
  });
});

describe("validateDraft", () => {
  it("requires a title", () => {
    expect(validateDraft(draft({ title: "   " }))).toBe("Give the zine a title.");
  });

  it("enforces API length limits", () => {
    expect(validateDraft(draft({ title: "x".repeat(141) }))).toBe("Keep the title to 140 characters or fewer.");
    expect(validateDraft(draft({ description: "x".repeat(401) }))).toBe("Keep the description to 400 characters or fewer.");
    const d = draft();
    const pages = updatePage(d.pages, d.pages[0].key, { caption: "x".repeat(401) });
    expect(validateDraft({ ...d, pages })).toBe(
      "Keep page 1's caption to 400 characters or fewer."
    );
  });

  it("caps a zine at 60 pages", () => {
    let pages = draft().pages;
    while (pages.length < 61) pages = addPage(pages, "x");
    expect(validateDraft(draft({ pages }))).toBe("A zine can have at most 60 pages.");
  });

  it("requires a URL slug", () => {
    expect(validateDraft(draft({ slug: " !!! " }))).toBe("Enter a URL using letters or numbers.");
  });

  it("accepts a valid draft", () => {
    expect(validateDraft(draft())).toBeNull();
  });
});

describe("canPublish", () => {
  it("needs at least one page", () => {
    expect(canPublish(draft())).toBe(true);
    expect(canPublish(draft({ pages: [] }))).toBe(false);
  });
});

describe("toSavePayload", () => {
  it("trims text, sends pages in order, and omits the slug when it is locked", () => {
    const d = draft({ title: "  Issue 2 ", description: "  ", slug: "issue-2" });
    expect(toSavePayload(d, { slugLocked: true })).toEqual({
      title: "Issue 2",
      description: null,
      pages: [
        { assetId: "a", caption: "", flipEnabled: true },
        { assetId: "b", caption: "Second", flipEnabled: false },
      ],
    });
    expect(toSavePayload(d, { slugLocked: false })).toMatchObject({ slug: "issue-2" });
  });
});
