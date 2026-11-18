import { parsePageContent, slugifyTitle } from "@/lib/types";

/** Limits from `src/app/api/zines/[id]/route.ts`. */
export const ZINE_LIMITS = {
  title: 140,
  description: 400,
  caption: 400,
  pages: 60,
} as const;

export interface EditorPage {
  /** Local-only identity for React keys; a photo may appear on more than one page. */
  key: string;
  assetId: string;
  caption: string;
  flipEnabled: boolean;
}

export interface EditorDraft {
  title: string;
  description: string;
  slug: string;
  pages: EditorPage[];
}

export interface ApiZine {
  title: string;
  description: string | null;
  slug: string;
  pages: { pageNumber: number; flipEnabled: boolean; content: unknown }[];
}

export interface SavePayload {
  title: string;
  description: string | null;
  slug?: string;
  pages: { assetId: string; caption: string; flipEnabled: boolean }[];
}

let keySeq = 0;
const newKey = () => `page-${++keySeq}`;

export function draftFromZine(zine: ApiZine): EditorDraft {
  return {
    title: zine.title,
    description: zine.description ?? "",
    slug: zine.slug,
    pages: [...zine.pages]
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((page) => {
        const content = parsePageContent(page.content);
        return {
          key: newKey(),
          assetId: content.assetId,
          caption: content.caption ?? "",
          flipEnabled: page.flipEnabled,
        };
      }),
  };
}

export function addPage(pages: EditorPage[], assetId: string): EditorPage[] {
  return [...pages, { key: newKey(), assetId, caption: "", flipEnabled: true }];
}

export function movePage(pages: EditorPage[], from: number, to: number): EditorPage[] {
  if (from < 0 || from >= pages.length || to < 0 || to >= pages.length || from === to) return pages;
  const next = [...pages];
  const [page] = next.splice(from, 1);
  next.splice(to, 0, page);
  return next;
}

export function updatePage(
  pages: EditorPage[],
  key: string,
  change: Partial<Omit<EditorPage, "key">>
): EditorPage[] {
  return pages.map((page) => (page.key === key ? { ...page, ...change } : page));
}

export function removePage(pages: EditorPage[], key: string): EditorPage[] {
  return pages.filter((page) => page.key !== key);
}

const comparable = (draft: EditorDraft) =>
  JSON.stringify({
    title: draft.title,
    description: draft.description,
    slug: draft.slug,
    pages: draft.pages.map(({ assetId, caption, flipEnabled }) => [assetId, caption, flipEnabled]),
  });

export function isDirty(saved: EditorDraft, current: EditorDraft): boolean {
  return comparable(saved) !== comparable(current);
}

export function validateDraft(draft: EditorDraft): string | null {
  if (!draft.title.trim()) return "Give the zine a title.";
  if (draft.title.trim().length > ZINE_LIMITS.title) {
    return `Keep the title to ${ZINE_LIMITS.title} characters or fewer.`;
  }
  if (draft.description.trim().length > ZINE_LIMITS.description) {
    return `Keep the description to ${ZINE_LIMITS.description} characters or fewer.`;
  }
  if (slugifyTitle(draft.slug) === "untitled-zine" && !/[a-z0-9]/i.test(draft.slug)) {
    return "Enter a URL using letters or numbers.";
  }
  if (draft.pages.length > ZINE_LIMITS.pages) return `A zine can have at most ${ZINE_LIMITS.pages} pages.`;
  const longCaption = draft.pages.findIndex((page) => page.caption.length > ZINE_LIMITS.caption);
  if (longCaption >= 0) {
    return `Keep page ${longCaption + 1}'s caption to ${ZINE_LIMITS.caption} characters or fewer.`;
  }
  return null;
}

export function canPublish(draft: EditorDraft): boolean {
  return draft.pages.length > 0;
}

export function toSavePayload(draft: EditorDraft, options: { slugLocked: boolean }): SavePayload {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    ...(options.slugLocked ? {} : { slug: draft.slug.trim() }),
    pages: draft.pages.map(({ assetId, caption, flipEnabled }) => ({ assetId, caption, flipEnabled })),
  };
}
