"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { readApiError, toBoardAsset, type BoardAsset } from "@/components/board/types";
import { BOARD_PAGE_SIZE } from "@/lib/board-pages";
import { ZineBoardPicker } from "./ZineBoardPicker";
import { EditedPhoto } from "@/components/EditedPhoto";

const dimsOf = (a: BoardAsset) => (a.width && a.height ? { width: a.width, height: a.height } : null);
import { assetLabel } from "@/components/board/board-utils";
import { DeleteZineDialog } from "./DeleteZineDialog";
import { PdfExport } from "./PdfExport";
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
  ZINE_LIMITS,
  type ApiZine,
  type EditorDraft,
} from "./editor-state";

export interface EditorZine extends ApiZine {
  id: string;
  published: boolean;
  publishedAt: string | null;
}

const LEAVE_MESSAGE = "You have unsaved changes. Leave without saving?";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20 read-only:bg-paper-100 read-only:text-ink-500";
const labelClass = "block font-mono text-xs uppercase tracking-wider text-ink-700";
const iconButton =
  "rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100 disabled:opacity-30";

export function ZineEditor({
  zine,
  board,
  boards,
  boardAssets: initialBoardAssets,
  boardCursor = null,
  boardTotal,
  pageAssets = [],
  tier,
}: {
  zine: EditorZine;
  /** The board the zine is built from, and all of the creator's boards (DIG-25). */
  board: { id: string; name: string };
  boards: { id: string; name: string }[];
  /** Photos on the zine's board: the ones that can be added as pages. */
  boardAssets: BoardAsset[];
  /** Cursor for the next page of the board's photos, or null when all are loaded (DIG-29). */
  boardCursor?: string | null;
  /** How many photos the board holds in all. */
  boardTotal?: number;
  /** Photos already on pages that have since moved to another board. */
  pageAssets?: BoardAsset[];
  tier: "free" | "pro";
}) {
  const router = useRouter();
  const id = useId();
  const initial = useMemo(() => draftFromZine(zine), [zine]);
  const [saved, setSaved] = useState<EditorDraft>(initial);
  const [draft, setDraft] = useState<EditorDraft>(initial);
  const [published, setPublished] = useState(zine.published);
  const [slugLocked, setSlugLocked] = useState(zine.publishedAt !== null);
  const [busy, setBusy] = useState<null | "save" | "publish" | "unpublish">(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const dirty = isDirty(saved, draft);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // The picker loads the board a page at a time (DIG-29).
  const [boardAssets, setBoardAssets] = useState(initialBoardAssets);
  const [cursor, setCursor] = useState(boardCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  useEffect(() => {
    setBoardAssets(initialBoardAssets);
    setCursor(boardCursor);
  }, [initialBoardAssets, boardCursor]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetch(
        `/api/assets?boardId=${encodeURIComponent(board.id)}&limit=${BOARD_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(await readApiError(res, "Could not load more photos."));
      const page = (await res.json()) as { assets: Parameters<typeof toBoardAsset>[0][]; nextCursor: string | null };
      setBoardAssets((prev) => [...prev, ...page.assets.map(toBoardAsset).filter((a) => !prev.some((p) => p.id === a.id))]);
      setCursor(page.nextCursor);
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : "Could not load more photos.");
    } finally {
      setLoadingMore(false);
    }
  }

  const assetsById = useMemo(
    () => new Map([...boardAssets, ...pageAssets].map((a, i) => [a.id, { asset: a, index: i }])),
    [boardAssets, pageAssets]
  );
  const labelFor = (assetId: string) => {
    const entry = assetsById.get(assetId);
    return entry ? assetLabel(entry.asset, entry.index) : "Photo unavailable";
  };

  // Warn before leaving with unsaved changes: full unloads and in-app links.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      // New tabs and downloads (such as the PDF export) do not leave the editor.
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  function edit(change: Partial<EditorDraft>) {
    setDraft((prev) => ({ ...prev, ...change }));
    setStatus("");
  }

  async function send(body: unknown): Promise<EditorZine | null> {
    try {
      const res = await fetch(`/api/zines/${encodeURIComponent(zine.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Could not save the zine."));
        return null;
      }
      return ((await res.json()) as { zine: EditorZine }).zine;
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      return null;
    }
  }

  function applySaved(next: EditorZine) {
    const fresh = draftFromZine(next);
    setSaved(fresh);
    setDraft(fresh);
    setPublished(next.published);
    setSlugLocked(next.publishedAt !== null);
    router.refresh();
  }

  async function save(publish?: boolean) {
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(publish ? "publish" : "save");
    setError(null);
    const next = await send({ ...toSavePayload(draft, { slugLocked }), ...(publish ? { published: true } : {}) });
    setBusy(null);
    if (!next) return;
    applySaved(next);
    setStatus(publish ? "Published. All changes saved" : "All changes saved");
  }

  async function unpublish() {
    setBusy("unpublish");
    setError(null);
    const next = await send({ published: false });
    setBusy(null);
    if (!next) return;
    // Only the status changes; keep any unsaved local edits.
    setPublished(next.published);
    setSlugLocked(next.publishedAt !== null);
    setStatus("Unpublished");
    router.refresh();
  }

  async function deleteZine(): Promise<string | null> {
    try {
      const res = await fetch(`/api/zines/${encodeURIComponent(zine.id)}`, { method: "DELETE" });
      if (!res.ok) return await readApiError(res, "Could not delete the zine.");
      dirtyRef.current = false;
      router.push("/editor");
      router.refresh();
      return null;
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
  }

  const publishable = canPublish(draft);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words font-serif text-3xl font-bold text-ink-900">{saved.title}</h1>
            <span
              className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${
                published ? "bg-vermilion-500 text-white" : "border border-paper-300 bg-paper-100 text-ink-700"
              }`}
            >
              {published ? "Published" : "Draft"}
            </span>
          </div>
          {published ? (
            <Link
              href={`/z/${saved.slug}`}
              className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-vermilion-600 underline underline-offset-2"
            >
              View public page
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : null}
          {published ? (
            <div className="mt-3">
              <PdfExport slug={saved.slug} tier={tier} dirty={dirty} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Save and publish bar */}
      <div className="sticky top-[72px] z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-paper-300 bg-paper-50/95 px-4 py-3 shadow-sm backdrop-blur">
        <p aria-live="polite" className="text-sm text-ink-700">
          {dirty ? <span className="font-medium text-vermilion-600">Unsaved changes</span> : status || "No changes"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || busy !== null}
            aria-busy={busy === "save"}
            className="rounded-xl border border-ink-900 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-paper-200 disabled:border-paper-300 disabled:text-ink-500"
          >
            {busy === "save" ? "Saving…" : "Save changes"}
          </button>
          {published ? (
            <button
              type="button"
              onClick={() => void unpublish()}
              disabled={busy !== null}
              aria-busy={busy === "unpublish"}
              className="rounded-xl border border-paper-300 bg-white px-4 py-2 text-sm font-semibold text-ink-800 transition hover:bg-paper-200 disabled:opacity-60"
            >
              {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={!publishable || busy !== null}
              aria-busy={busy === "publish"}
              aria-describedby={publishable ? undefined : `${id}-publish-hint`}
              className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-40"
            >
              {busy === "publish" ? "Publishing…" : "Publish"}
            </button>
          )}
        </div>
        {!publishable && !published ? (
          <p id={`${id}-publish-hint`} className="w-full text-xs text-ink-500">
            Add a page to publish.
          </p>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-xs font-medium underline underline-offset-2">
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Details */}
      <section aria-labelledby={`${id}-details`} className="space-y-4 rounded-2xl border border-paper-300 bg-white p-5">
        <h2 id={`${id}-details`} className="font-serif text-lg font-bold">
          Details
        </h2>
        <div>
          <label htmlFor={`${id}-title`} className={labelClass}>
            Title
          </label>
          <input
            id={`${id}-title`}
            value={draft.title}
            maxLength={ZINE_LIMITS.title + 10}
            onChange={(e) => edit({ title: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-description`} className={labelClass}>
            Description
          </label>
          <textarea
            id={`${id}-description`}
            value={draft.description}
            rows={2}
            onChange={(e) => edit({ description: e.target.value })}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-ink-500">Shown when the zine is shared. Optional.</p>
        </div>
        <div>
          <label htmlFor={`${id}-slug`} className={labelClass}>
            Public URL
          </label>
          <div className="flex items-center gap-1">
            <span className="mt-1.5 shrink-0 font-mono text-sm text-ink-500">/z/</span>
            <input
              id={`${id}-slug`}
              value={draft.slug}
              readOnly={slugLocked}
              aria-describedby={`${id}-slug-hint`}
              onChange={(e) => edit({ slug: e.target.value })}
              className={`${inputClass} font-mono`}
            />
          </div>
          <p id={`${id}-slug-hint`} className="mt-1 text-xs text-ink-500">
            {slugLocked
              ? "The URL is locked because this zine has been published."
              : "Letters, numbers, and dashes. It cannot change after you publish."}
          </p>
        </div>
      </section>

      <ZineBoardPicker
        zineId={zine.id}
        boardId={board.id}
        boards={boards}
        canChange={saved.pages.length === 0 && draft.pages.length === 0}
      />

      {/* Pages */}
      <section aria-labelledby={`${id}-pages`} className="space-y-3">
        <h2 id={`${id}-pages`} className="font-serif text-lg font-bold">
          Pages <span className="font-sans text-sm font-normal text-ink-500">({draft.pages.length})</span>
        </h2>
        {draft.pages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-paper-300 bg-paper-100/60 px-5 py-8 text-center text-sm text-ink-500">
            No pages yet. Add photos from your board below.
          </p>
        ) : (
          <ol aria-label="Pages" className="space-y-3">
            {draft.pages.map((page, index) => {
              const n = index + 1;
              const entry = assetsById.get(page.assetId);
              return (
                <li key={page.key} className="flex flex-col gap-4 rounded-2xl border border-paper-300 bg-white p-4 sm:flex-row">
                  <div className="relative w-full shrink-0 overflow-hidden rounded-xl bg-ink-900 sm:w-28">
                    {entry ? (
                      <EditedPhoto
                        src={entry.asset.publicUrl}
                        alt={labelFor(page.assetId)}
                        edit={entry.asset.edit}
                        dims={dimsOf(entry.asset)}
                        sizes="(max-width: 640px) 100vw, 112px"
                      />
                    ) : (
                      <span className="flex aspect-[4/5] items-center justify-center p-2 text-center text-xs text-paper-50">Photo unavailable</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0">
                        <span className="font-mono text-xs uppercase tracking-wider text-vermilion-600">Page {n}</span>
                        <span className="block truncate text-sm font-medium text-ink-900">{labelFor(page.assetId)}</span>
                      </p>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => edit({ pages: movePage(draft.pages, index, index - 1) })} disabled={index === 0} aria-label={`Move page ${n} earlier`} className={iconButton}>
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => edit({ pages: movePage(draft.pages, index, index + 1) })} disabled={index === draft.pages.length - 1} aria-label={`Move page ${n} later`} className={iconButton}>
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => edit({ pages: removePage(draft.pages, page.key) })} aria-label={`Remove page ${n}`} className={`${iconButton} hover:border-red-300 hover:bg-red-50 hover:text-red-700`}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label htmlFor={`${id}-caption-${page.key}`} className="sr-only">
                        Caption for page {n}
                      </label>
                      <textarea
                        id={`${id}-caption-${page.key}`}
                        value={page.caption}
                        rows={2}
                        placeholder="Caption (optional)"
                        onChange={(e) => edit({ pages: updatePage(draft.pages, page.key, { caption: e.target.value }) })}
                        className={`${inputClass} mt-0`}
                      />
                      <p className={`mt-1 text-right text-[11px] ${page.caption.length > ZINE_LIMITS.caption ? "text-red-700" : "text-ink-500"}`}>
                        {page.caption.length}/{ZINE_LIMITS.caption}
                      </p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-800">
                      <input
                        type="checkbox"
                        checked={page.flipEnabled}
                        onChange={(e) => edit({ pages: updatePage(draft.pages, page.key, { flipEnabled: e.target.checked }) })}
                        className="h-4 w-4 accent-vermilion-500"
                      />
                      Flip card<span className="sr-only"> on page {n}</span>
                      <span className="text-xs text-ink-500">
                        {page.flipEnabled ? "· readers can flip to EXIF or the recipe" : "· photo only"}
                      </span>
                    </label>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Add pages */}
      <section aria-labelledby={`${id}-add`} className="space-y-3">
        <h2 id={`${id}-add`} className="font-serif text-lg font-bold">
          Add pages from your board
        </h2>
        {boardAssets.length === 0 ? (
          <p className="text-sm text-ink-500">
            “{board.name}” has no photos yet.{" "}
            <Link href={`/boards/${board.id}`} className="font-medium text-vermilion-600 underline underline-offset-2">
              Add photos to {board.name}
            </Link>{" "}
            first.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {boardAssets.map((asset, index) => {
              const label = assetLabel(asset, index);
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => edit({ pages: addPage(draft.pages, asset.id) })}
                    disabled={draft.pages.length >= ZINE_LIMITS.pages}
                    className="group w-full overflow-hidden rounded-xl border border-paper-300 bg-white text-left transition hover:border-vermilion-500 disabled:opacity-40"
                  >
                    <span className="relative block bg-ink-900">
                      <EditedPhoto
                        as="span"
                        src={asset.publicUrl}
                        alt=""
                        edit={asset.edit}
                        dims={dimsOf(asset)}
                        sizes="(max-width: 640px) 50vw, 160px"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-ink-900/0 text-paper-50 opacity-0 transition group-hover:bg-ink-900/40 group-hover:opacity-100">
                        <ImagePlus className="h-6 w-6" aria-hidden="true" />
                      </span>
                    </span>
                    <span className="block truncate px-2.5 py-2 text-xs text-ink-800">
                      <span className="sr-only">Add </span>
                      {label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {cursor ? (
          <div className="flex flex-col items-center gap-2 pt-2">
            <p className="text-xs text-ink-500">
              Showing {boardAssets.length} of {(boardTotal ?? boardAssets.length).toLocaleString("en-US")} photos on this board.
            </p>
            {loadMoreError ? (
              <p role="alert" className="text-sm text-red-800">
                {loadMoreError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              aria-busy={loadingMore}
              className="rounded-xl border border-paper-300 bg-white px-5 py-2 text-sm font-medium text-ink-800 shadow-sm transition hover:bg-paper-100 disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load more photos"}
            </button>
          </div>
        ) : null}
      </section>

      {/* Danger zone */}
      <section aria-labelledby={`${id}-danger`} className="rounded-2xl border border-red-200 bg-red-50/50 p-5">
        <h2 id={`${id}-danger`} className="font-serif text-lg font-bold text-red-800">
          Delete zine
        </h2>
        <p className="mt-1 text-sm text-ink-700">Deleting removes the zine and its pages. Your photos stay on your board.</p>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="mt-3 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
        >
          Delete zine
        </button>
      </section>

      <DeleteZineDialog
        open={deleteOpen}
        title={saved.title}
        published={published}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={deleteZine}
      />
    </div>
  );
}
