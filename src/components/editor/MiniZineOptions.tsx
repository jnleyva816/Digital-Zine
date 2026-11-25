"use client";

import { useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { MINI_PHOTO_MINIMUM, miniInnerPages, pickMiniPages } from "@/lib/mini-zine";
import { MINI_PHOTO_LIMIT, type PdfSettings } from "@/lib/pdf-settings";
import { FoldingSteps } from "./FoldingSteps";
import { WebPhoto, nameOf, onePerPhoto, type PreviewPage, type PreviewZine } from "./PdfPagePreview";
import { Check, Group } from "./pdf-panel-ui";
import type { PdfStyle } from "./usePdfStyle";

/** The photos and pages the print sheet would have, by the same rules as the PDF. */
export function miniPlan(look: PdfSettings | null, zine: PreviewZine) {
  const photos = pickMiniPages(zine.pages, (p) => p.assetId, look?.miniPhotos ?? []);
  const inner = miniInnerPages(photos, (look?.recipePage ?? true) && photos.some((p) => p.recipe));
  // The cover is page 1.
  return { photos, inner, pageOf: (index: number) => inner.findIndex((p) => p.kind === "photo" && p.photo === photos[index]) + 2 };
}

export const enoughMiniPhotos = (look: PdfSettings | null, zine: PreviewZine) => miniPlan(look, zine).photos.length >= MINI_PHOTO_MINIMUM;

const tool = "flex h-8 w-8 items-center justify-center rounded-md bg-ink-900/80 text-paper-50 transition hover:bg-ink-900 aria-disabled:opacity-40 disabled:opacity-40";

/** What the mini zine holds: its photos, in order, and its own options (DIG-74). */
export function MiniZineOptions({ style, zine }: { style: PdfStyle; zine: PreviewZine }) {
  const id = useId();
  const counter = useRef<HTMLParagraphElement>(null);
  const [picking, setPicking] = useState(false);
  const { look } = style;
  const { photos, pageOf } = miniPlan(look, zine);

  const full = photos.length >= MINI_PHOTO_LIMIT;
  const chosen = new Set(photos.map((p) => p.assetId));
  const others = onePerPhoto(zine.pages).filter((p) => !chosen.has(p.assetId));

  const choose = (next: PreviewPage[]) => style.edit({ miniPhotos: [...new Set(next.map((p) => p.assetId))] });
  function move(from: number, to: number) {
    if (to < 0 || to >= photos.length) return;
    const next = [...photos];
    next.splice(to, 0, ...next.splice(from, 1));
    choose(next);
  }
  function remove(index: number) {
    choose(photos.filter((_, i) => i !== index));
    // The button that had focus is gone.
    counter.current?.focus();
  }
  function add(page: PreviewPage) {
    choose([...photos, page]);
    setPicking(false);
    counter.current?.focus();
  }

  return (
    <>
      <Group title="Photos">
        <p ref={counter} tabIndex={-1} aria-live="polite" className="text-[13px] text-ink-700 outline-hidden">
          {photos.length} of {MINI_PHOTO_LIMIT}
        </p>
        <ul aria-label="Mini zine photos" className="grid grid-cols-3 gap-2">
          {photos.map((page, i) => {
            const name = nameOf(page);
            return (
              <li key={`${page.assetId}-${page.pageNumber}`} className="relative h-28 overflow-hidden rounded-md bg-ink-900">
                <WebPhoto photo={page.photo} alt={`Page ${pageOf(i)}: ${name}`} fit="cover" sizes="130px" />
                <span aria-hidden="true" className="absolute left-1.5 top-1.5 rounded-full bg-ink-900/80 px-1.5 py-0.5 text-[11px] text-paper-50">
                  {pageOf(i)}
                </span>
                <button type="button" aria-label={`Remove ${name}`} disabled={!look || photos.length === 1} onClick={() => remove(i)} className={`absolute right-1 top-1 ${tool}`}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
                {/* aria-disabled, not disabled: focus stays on the button when its photo reaches an end. */}
                <span className="absolute inset-x-1 bottom-1 flex justify-between">
                  <button type="button" aria-label={`Move ${name} earlier`} aria-disabled={!look || i === 0} onClick={() => move(i, i - 1)} className={tool}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Move ${name} later`} aria-disabled={!look || i === photos.length - 1} onClick={() => move(i, i + 1)} className={tool}>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
          {Array.from({ length: Math.max(0, MINI_PHOTO_LIMIT - photos.length) }, (_, i) => (
            <li key={`empty-${i}`}>
              <button
                type="button"
                disabled={!look || others.length === 0}
                aria-expanded={picking}
                onClick={() => setPicking((open) => !open)}
                className="h-28 w-full rounded-md border-[1.5px] border-dashed border-[#A89F92] text-[13px] text-ink-700 transition enabled:hover:bg-paper-100 disabled:opacity-50"
              >
                <span aria-hidden="true">+ </span>Add photo
              </button>
            </li>
          ))}
        </ul>
        {picking && !full && others.length > 0 ? (
          <div role="group" aria-labelledby={`${id}-add`} className="space-y-2 rounded-xl bg-paper-100 p-3">
            <p id={`${id}-add`} className="text-[13px] font-medium">
              Add a photo
            </p>
            <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto p-0.5">
              {others.map((page) => (
                <button
                  key={page.assetId}
                  type="button"
                  aria-label={`Add ${nameOf(page)}`}
                  onClick={() => add(page)}
                  className="relative h-20 overflow-hidden rounded-md bg-ink-900 hover:opacity-80 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-vermilion-500"
                >
                  <WebPhoto photo={page.photo} fit="cover" sizes="90px" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {full && others.length > 0 ? <p className="text-xs text-ink-700">The mini zine holds {MINI_PHOTO_LIMIT} photos. Remove one to add another.</p> : null}
        {photos.length < MINI_PHOTO_MINIMUM ? <p className="text-xs font-medium text-red-800">A mini zine needs at least {MINI_PHOTO_MINIMUM} photos.</p> : null}
        {!full && others.length === 0 ? <p className="text-xs text-ink-700">Every photo in this zine is in. Add pages to the zine for more.</p> : null}
        <p className="text-xs leading-snug text-ink-500">
          Cover, back and up to 6 photos. Fewer than 6 frees pages for an intro and a recipe page. A longer zine uses its first 6 photos unless you pick others.
        </p>
      </Group>

      <Group title="Print sheet">
        {(
          [
            ["recipePage", "Recipe page (uses a free page)"],
            ["guides", "Fold and cut guides"],
            ["inkSaver", "Ink saver (light pages, even on dark templates)"],
          ] as const
        ).map(([key, label]) => (
          <Check key={key} label={label} checked={look?.[key] ?? false} disabled={!look} onChange={(on) => style.edit({ [key]: on })} />
        ))}
      </Group>
    </>
  );
}

const NOTES = { photo: "Photo", intro: "Intro (free page)", recipes: "Recipes (free page)", blank: "Blank" } as const;

/** Beside the mini zine's options: how to fold it, and the order its pages read in. */
export function MiniZineGuide({ style, zine }: { style: PdfStyle; zine: PreviewZine }) {
  const id = useId();
  const { photos, inner } = miniPlan(style.look, zine);
  const cover = style.look?.cover;
  const strip: { label: string; note: string; page?: PreviewPage }[] = [
    cover?.style === "title" || !cover
      ? { label: "Cover", note: "Title, byline" }
      : { label: "Cover", note: cover.style === "grid" ? "Photos, title" : "Photo, title", page: cover.style === "grid" ? photos[0] : (zine.pages.find((p) => p.assetId === cover.photo) ?? photos[0]) },
    ...inner.map((p, i) => ({ label: String(i + 2), note: NOTES[p.kind], page: p.kind === "photo" ? p.photo : undefined })),
    { label: "Back", note: "Link to the online zine" },
  ];
  return (
    <div className="max-w-[960px] space-y-7">
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id={`${id}-fold`} className="font-serif text-2xl font-bold">
            How to fold it
          </h3>
          <a href="/help/mini-zine" target="_blank" rel="noopener" className="text-sm font-medium text-vermilion-600 underline underline-offset-2">
            Folding steps on their own page<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
        <FoldingSteps labelledBy={`${id}-fold`} />
      </div>
      <div className="space-y-2.5">
        <h3 id={`${id}-order`} className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-700">
          Reading order once folded
        </h3>
        <ol aria-labelledby={`${id}-order`} className="flex list-none flex-wrap gap-2.5 p-0">
          {strip.map(({ label, note, page }) => (
            <li key={label} className="flex w-[84px] flex-col items-center gap-1">
              <span className="order-2 text-xs text-ink-700">{label}</span>
              <span className="order-1 flex h-[124px] w-full flex-col gap-1 border border-[#CFC7BC] bg-paper-50 p-1.5">
                {page ? (
                  <span className="relative block h-20 shrink-0">
                    <WebPhoto photo={page.photo} fit="cover" sizes="84px" />
                  </span>
                ) : null}
                <span className="text-[10px] leading-tight text-ink-700">{note}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
