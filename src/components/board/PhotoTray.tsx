"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Check, ImagePlus, PanelLeftClose, Search } from "lucide-react";
import { EditedPhoto } from "@/components/EditedPhoto";
import { BOARD_PAGE_SIZE } from "@/lib/board-pages";
import { LoadMore } from "./LoadMore";
import { assetLabel } from "./board-utils";
import { ACCEPTED_IMAGE_TYPES, readApiError, toBoardAsset, type BoardAsset } from "./types";

const FILTERS = [
  { show: "all", label: "All" },
  { show: "unplaced", label: "Not on board" },
  { show: "recipes", label: "Recipes" },
] as const;
type Show = (typeof FILTERS)[number]["show"];

interface TrayPage {
  assets: Parameters<typeof toBoardAsset>[0][];
  nextCursor: string | null;
  counts: Record<Show, number>;
}

interface PhotoTrayProps {
  boardId: string;
  trayRef: RefObject<HTMLElement | null>;
  /** What the board already has, shown until the tray's own list arrives. */
  initial: BoardAsset[];
  /** The board's live copy of a photo, which may be newer than the tray's. */
  latest: (asset: BoardAsset) => BoardAsset;
  isPlaced: (assetId: string) => boolean;
  /** Changes when the list should be asked for again: an upload, a delete, a saved layout. */
  revision: string;
  onFiles: (files: FileList) => void;
  onPlace: (asset: BoardAsset) => void;
  onFind: (assetId: string) => void;
  onDragStart: (asset: BoardAsset, e: React.PointerEvent<HTMLButtonElement>) => void;
  onHide: () => void;
}

/** Every photo on this board, to drag onto the free-form canvas (DIG-88). */
export function PhotoTray({ boardId, trayRef, initial, latest, isPlaced, revision, onFiles, onPlace, onFind, onDragStart, onHide }: PhotoTrayProps) {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [photos, setPhotos] = useState(initial);
  const [cursor, setCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<Show, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);

  const load = useCallback(
    async (after: string | null) => {
      const mine = ++request.current;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ boardId, limit: String(BOARD_PAGE_SIZE), show });
        if (search) query.set("q", search);
        if (after) query.set("cursor", after);
        const res = await fetch(`/api/assets?${query}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await readApiError(res, "Could not load photos."));
        const page = (await res.json()) as TrayPage;
        // A newer search or filter has been asked for since.
        if (mine !== request.current) return;
        const rows = page.assets.map(toBoardAsset);
        setPhotos((prev) => (after ? [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))] : rows));
        setCursor(page.nextCursor);
        setCounts(page.counts);
      } catch (err) {
        if (mine === request.current) setError(err instanceof Error ? err.message : "Could not load photos.");
      } finally {
        if (mine === request.current) setLoading(false);
      }
    },
    [boardId, search, show]
  );

  useEffect(() => {
    void load(null);
  }, [load, revision]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && void load(cursor), { rootMargin: "400px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, load]);

  // Placed a moment ago: gone from "Not on board" without waiting for the server.
  const shown = photos.filter((p) => show !== "unplaced" || !isPlaced(p.id));

  return (
    <aside ref={trayRef} aria-label="Photos on this board" className="flex w-[280px] shrink-0 flex-col border-r border-paper-300 bg-paper-50">
      <div className="space-y-3 p-4 pb-3">
        <div className="flex items-center gap-2">
          <label className="flex h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-paper-300 text-[13px] text-ink-700 focus-within:outline focus-within:outline-2 focus-within:outline-vermilion-500 hover:bg-paper-100">
            <ImagePlus className="h-[18px] w-[18px] text-vermilion-600" aria-hidden="true" />
            <span>
              Drop photos or <span className="font-semibold text-vermilion-600 underline underline-offset-2">browse</span>
            </span>
            <input
              type="file"
              multiple
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" aria-label="Hide photo tray" onClick={onHide} className="rounded-lg p-2 text-ink-500 hover:bg-paper-200 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-vermilion-500">
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex h-10 items-center gap-2 rounded-[10px] border border-paper-300 bg-white px-3 text-ink-500 focus-within:border-vermilion-500 focus-within:ring-2 focus-within:ring-vermilion-500/20">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search photos"
            placeholder="Name, recipe, camera"
            maxLength={100}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full min-w-0 bg-transparent text-[13px] text-ink-900 placeholder:text-ink-500 focus:outline-none"
          />
        </div>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.show}
              type="button"
              aria-pressed={show === f.show}
              onClick={() => setShow(f.show)}
              className={`min-h-8 rounded-full border px-3 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500 ${show === f.show ? "border-ink-900 bg-ink-900 text-paper-50" : "border-paper-300 bg-white text-ink-900"}`}
            >
              {f.label} {counts ? counts[f.show] : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <ul className="grid grid-cols-2 gap-x-2.5 gap-y-3 pt-1">
          {shown.map((row, i) => {
            const asset = latest(row);
            const label = assetLabel(asset, i);
            const placed = isPlaced(asset.id);
            const ready = asset.status === "ready";
            return (
              <li key={asset.id} className="min-w-0">
                <button
                  type="button"
                  // A placed photo is drawn on the board, and moves from there.
                  data-flow={placed ? undefined : asset.id}
                  disabled={!ready}
                  aria-label={!ready ? `${label}, processing` : placed ? `${label}, on the board` : `Place ${label} on the board`}
                  onPointerDown={(e) => ready && !placed && onDragStart(asset, e)}
                  onClick={(e) => {
                    if (placed) onFind(asset.id);
                    // A keyboard or screen reader "click"; the pointer drags instead.
                    else if (e.detail === 0) onPlace(asset);
                  }}
                  className={`relative block w-full touch-pan-y overflow-hidden rounded-md bg-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500 ${placed ? "ring-2 ring-ink-900" : ready ? "cursor-grab" : ""}`}
                  style={{ aspectRatio: "4 / 5" }}
                >
                  {ready ? (
                    <EditedPhoto as="span" src={asset.publicUrl} alt="" edit={asset.edit} dims={asset.width && asset.height ? { width: asset.width, height: asset.height } : null} sizes="124px" blurDataUrl={asset.blurDataUrl} className="pointer-events-none" />
                  ) : (
                    <span className="flex h-full items-center justify-center px-2 text-center text-xs text-paper-50">{asset.status === "failed" ? "Could not be processed" : "Processing…"}</span>
                  )}
                  {placed ? (
                    <span aria-hidden="true" className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 text-paper-50">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : null}
                  {asset.kind === "recipe" && asset.recipe ? (
                    <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-full bg-paper-50/90 px-1.5 py-0.5 font-mono text-[10px] text-ink-900">{asset.recipe.name}</span>
                  ) : null}
                </button>
                <p aria-hidden="true" className="mt-1 truncate text-xs text-ink-800">
                  {label}
                </p>
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && !loading && !error ? (
          <p className="py-6 text-center text-sm text-ink-500">{search ? "No photos match." : show === "unplaced" ? "Every photo is on the board." : show === "recipes" ? "No photos with a recipe yet." : "No photos yet. Drop some here."}</p>
        ) : null}
        {cursor ? <LoadMore sentinelRef={sentinelRef} loading={loading} error={error} onLoadMore={() => void load(cursor)} /> : null}
        {error && !cursor ? (
          <p role="alert" className="py-3 text-sm text-red-800">
            {error}{" "}
            <button type="button" className="underline" onClick={() => void load(null)}>
              Try again
            </button>
          </p>
        ) : null}
      </div>
      <p className="border-t border-paper-200 px-4 py-2.5 text-xs leading-snug text-ink-500">Drag a photo onto the board. Drag it back here to take it off the board; it stays in your photos.</p>
    </aside>
  );
}
