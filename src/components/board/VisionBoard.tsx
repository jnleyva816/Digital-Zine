"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { flowElement, transitionBoard } from "@/lib/board-transition";
import type { FoundRecipe } from "@/lib/fuji-makernote";
import { GRID_LAYOUTS, type BoardNote, type BoardViewPrefs, type GridLayout, type Placement } from "@/lib/board-layout";
import type { RecipeData } from "@/lib/types";
import { BoardStrip, type StripCardLook } from "./BoardStrip";
import { BoardBar, type BuiltView } from "./BoardBar";
import { FreeformBoard } from "./FreeformBoard";
import { assetLabel } from "./board-utils";
import { StorageMeter } from "./StorageMeter";
import { PhotoEditor } from "./PhotoEditor";
import type { PhotoEdit } from "@/lib/photo-edit";
import type { SavedRecipe } from "@/lib/recipe-library";
import { RecipeEditor } from "./RecipeEditor";
import { LoadMore } from "./LoadMore";
import { PhotoCard } from "./PhotoCard";
import { UploadDropzone } from "./UploadDropzone";
import { UploadList } from "./UploadList";
import { useBoardLayout } from "./useBoardLayout";
import { useBoardPaging } from "./useBoardPaging";
import { useMasonry } from "./useMasonry";
import { useBoardReorder } from "./useBoardReorder";
import { useProcessingPoll } from "./useProcessingPoll";
import { useUploadQueue } from "./useUploadQueue";
import { ACCEPTED_IMAGE_TYPES, readApiError, toBoardAsset, type BoardAsset } from "./types";

export interface VisionBoardProps {
  /** The board on screen (DIG-25). Uploads land here. */
  boardId: string;
  boardName?: string;
  /** The views this board was last seen in (DIG-86). */
  viewPrefs?: BoardViewPrefs;
  /** The free-form layout (DIG-87), and the placed photos that are not on the first page. */
  initialPlacements?: Placement[];
  /** The free-form board's sticky notes (DIG-89). */
  initialNotes?: BoardNote[];
  placedAssets?: BoardAsset[];
  initialAssets: BoardAsset[];
  /** The creator's other boards, for moving photos. */
  otherBoards: { id: string; name: string }[];
  /** Bytes stored in the account outside `initialAssets`; storage is one quota for the account. */
  otherBoardsBytes: number;
  /** Cursor for the next page of this board's photos, or null when all are loaded (DIG-29). */
  initialCursor?: string | null;
  /** How many photos the board holds in all. */
  initialTotal?: number;
  /** Titles of the zines whose pages use each photo, by photo id. */
  usedIn: Record<string, string[]>;
  /** The creator's recipe library (DIG-24). */
  savedRecipes?: SavedRecipe[];
}

const GRID_LAYOUT_NAMES: Record<GridLayout, string> = { masonry: "Masonry", even: "Even", feature: "Feature" };
const VIEW_NAMES: Record<BuiltView, string> = { free: "Free form", grid: "Grid", strip: "Strip" };
const WIDE_SCREEN = "(min-width: 1024px)";

/**
 * The Vision Board: its bar, its views, uploads, and each photo's actions. Uploading, paging, the
 * processing poll, and reordering live in their own hooks, and each card in PhotoCard (DIG-47).
 */
export function VisionBoard({
  boardId,
  boardName: initialName = "Vision Board",
  viewPrefs = {},
  initialPlacements = [],
  initialNotes = [],
  placedAssets = [],
  initialAssets,
  otherBoards,
  otherBoardsBytes,
  usedIn,
  savedRecipes: initialSavedRecipes = [],
  initialCursor = null,
  initialTotal,
}: VisionBoardProps) {
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>(initialSavedRecipes);
  const [assets, setAssets] = useState<BoardAsset[]>(initialAssets);
  /** Placed photos, and ones picked from the tray, that the paged list has not reached yet. */
  const [extras, setExtras] = useState<BoardAsset[]>(placedAssets);
  const [boardName, setBoardName] = useState(initialName);
  /** Null until the browser has said how wide the screen is. */
  const [wide, setWide] = useState<boolean | null>(null);
  const [chosenView, setChosenView] = useState(viewPrefs);
  /** The photo last focused, and the one a view opens at because it was. */
  const focusedId = useRef<string | null>(null);
  const [startAt, setStartAt] = useState<string | null>(null);
  const layout = useBoardLayout(boardId, initialPlacements, initialNotes, () => setBoardError("This board was changed somewhere else, so its layout was reloaded."));
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const [elsewhereBytes, setElsewhereBytes] = useState(otherBoardsBytes);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [namingId, setNamingId] = useState<string | null>(null);
  const [photoEditId, setPhotoEditId] = useState<string | null>(null);
  /** Recipes read from a photo at upload, held until the creator names and saves one. */
  const [foundRecipes, setFoundRecipes] = useState<Record<string, FoundRecipe>>({});
  const [announcement, setAnnouncement] = useState("");
  const [boardError, setBoardError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const usedBytes = elsewhereBytes + assets.reduce((sum, a) => sum + a.sizeBytes, 0);

  const byId = useMemo(() => new Map([...extras, ...assets].map((a) => [a.id, a])), [extras, assets]);
  const findAsset = useCallback((id: string) => byId.get(id), [byId]);

  /** Changes a photo wherever the board keeps it. */
  function updateAsset(id: string, change: (asset: BoardAsset) => BoardAsset) {
    const apply = (list: BoardAsset[]) => list.map((a) => (a.id === id ? change(a) : a));
    setAssets(apply);
    setExtras(apply);
  }

  function dropAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setExtras((prev) => prev.filter((a) => a.id !== id));
    layout.forget(id);
  }

  useEffect(() => {
    const asked = new URLSearchParams(location.search).get("view");
    if (asked === "free") setChosenView((v) => ({ ...v, wide: "free" }));
    if (asked === "strip") setChosenView((v) => ({ ...v, wide: "strip", narrow: "strip" }));
    if (asked === "grid") setChosenView((v) => ({ ...v, wide: "grid", narrow: "grid" }));
    const query = typeof matchMedia === "function" ? matchMedia(WIDE_SCREEN) : null;
    const update = () => setWide(query?.matches ?? false);
    update();
    query?.addEventListener("change", update);
    return () => query?.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-asset-id], [data-placed], [data-flow]") : null;
      const id = el?.dataset.assetId ?? el?.dataset.placed ?? el?.dataset.flow;
      if (id) focusedId.current = id;
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);

  // Free form needs a wide screen.
  const view: BuiltView | null = wide === null ? null : wide ? (chosenView.wide ?? "free") : (chosenView.narrow ?? "grid");

  function chooseView(next: BuiltView) {
    const prefs: BoardViewPrefs = wide ? { wide: next } : { narrow: next === "strip" ? "strip" : "grid" };
    if (next !== view) {
      const keep = focusedId.current && flowElement(focusedId.current) ? focusedId.current : null;
      transitionBoard({
        order: assets.map((a) => a.id),
        update: () => {
          setStartAt(keep);
          setChosenView((v) => ({ ...v, ...prefs }));
        },
      });
    }
    const params = new URLSearchParams(location.search);
    params.set("view", next);
    history.replaceState(history.state, "", `${location.pathname}?${params}`);
    setAnnouncement(`${VIEW_NAMES[next]} view`);
    rememberView(prefs);
  }

  /** Remembering is a convenience: if it fails, the view still changed. */
  function rememberView(viewPrefs: BoardViewPrefs) {
    void fetch(`/api/boards/${encodeURIComponent(boardId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewPrefs }),
    }).catch(() => undefined);
  }

  async function renameBoard(name: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return await readApiError(res, "Could not rename the board.");
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
    setBoardName(name);
    setAnnouncement(`Board renamed to ${name}.`);
    return null;
  }

  const { cursor, total, setTotal, loadingMore, loadMoreError, loadMore, sentinelRef } = useBoardPaging({
    boardId,
    initialCursor,
    initialTotal: initialTotal ?? initialAssets.length,
    loadedIds: () => new Set(assetsRef.current.map((a) => a.id)),
    onPage: (added) => {
      setAssets((prev) => [...prev, ...added.filter((a) => !prev.some((p) => p.id === a.id))]);
      // These photos' bytes were counted as "elsewhere" until now.
      setElsewhereBytes((bytes) => Math.max(0, bytes - added.reduce((sum, a) => sum + a.sizeBytes, 0)));
    },
  });

  // The strip shows the whole board, so it loads the rest of it page by page.
  useEffect(() => {
    if (view === "strip" && cursor && !loadingMore && !loadMoreError) void loadMore();
  }, [view, cursor, loadingMore, loadMoreError, loadMore]);

  useProcessingPoll(boardId, assets, setAssets);

  const { uploads, isUploading, enqueue, dismiss } = useUploadQueue({
    boardId,
    usedBytes,
    onUploaded: (asset, foundRecipe) => {
      setAssets((prev) => [...prev, asset]);
      setTotal((t) => t + 1);
      if (foundRecipe) setFoundRecipes((prev) => ({ ...prev, [asset.id]: foundRecipe }));
    },
    onFinished: setAnnouncement,
  });

  const gridLayout = chosenView.gridLayout ?? "masonry";
  const masonry = useMasonry(view === "grid" && gridLayout === "masonry", assets);

  // The grid is as tall as the board, so the page scrolls to the photo, once the cards have their
  // places. The other views open at it themselves.
  const gridPlaced = view === "grid" && (gridLayout !== "masonry" || masonry.listStyle !== undefined);
  const scrolledTo = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (view !== "grid") scrolledTo.current = null;
    if (!gridPlaced || !startAt || scrolledTo.current === startAt) return;
    scrolledTo.current = startAt;
    document.querySelector(`li[data-asset-id="${CSS.escape(startAt)}"]`)?.scrollIntoView?.({ block: "center" });
  }, [view, gridPlaced, startAt]);

  function chooseLayout(next: GridLayout) {
    setChosenView((v) => ({ ...v, gridLayout: next }));
    setAnnouncement(`${GRID_LAYOUT_NAMES[next]} layout`);
    rememberView({ gridLayout: next });
  }

  function gridColumns() {
    if (gridLayout === "masonry" || !masonry.list) return masonry.columns;
    return getComputedStyle(masonry.list).gridTemplateColumns.split(" ").length;
  }

  const reorder = useBoardReorder({ assets, setAssets, onAnnounce: setAnnouncement, onError: setBoardError });

  // A card moved from the keyboard stays on screen.
  const heldAt = reorder.heldId ? assets.findIndex((a) => a.id === reorder.heldId) : -1;
  useEffect(() => {
    if (heldAt >= 0) document.activeElement?.scrollIntoView?.({ block: "nearest" });
  }, [heldAt]);

  async function retryProcessing(asset: BoardAsset) {
    setBoardError(null);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}/process`, { method: "POST" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not retry processing."));
      const body = (await res.json()) as { asset: Parameters<typeof toBoardAsset>[0] };
      const updated = toBoardAsset(body.asset);
      updateAsset(asset.id, (a) => ({ ...a, ...updated, recipe: a.recipe }));
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : "Could not retry processing.");
    }
  }
  function forgetFound(id: string) {
    setFoundRecipes((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function saveRecipe(assetId: string, recipe: RecipeData | null): Promise<string | null> {
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe ? { kind: "recipe", recipe } : { kind: "photo", recipe: null }),
      });
      if (!res.ok) return await readApiError(res, "Could not save the recipe.");
      const body = (await res.json()) as { asset: Parameters<typeof toBoardAsset>[0] };
      const updated = toBoardAsset(body.asset);
      updateAsset(assetId, () => updated);
      forgetFound(assetId);
      setEditingId(null);
      setAnnouncement(recipe ? "Recipe saved." : "Recipe removed.");
      return null;
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
  }

  /** Links a photo to a saved recipe, or unlinks it with null (DIG-24). */
  async function linkRecipe(assetId: string, recipeId: string | null): Promise<string | null> {
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      if (!res.ok) return await readApiError(res, "Could not use the saved recipe.");
      const updated = toBoardAsset(((await res.json()) as { asset: Parameters<typeof toBoardAsset>[0] }).asset);
      updateAsset(assetId, (a) => ({ ...a, kind: updated.kind, recipe: updated.recipe, recipeId: updated.recipeId }));
      setSavedRecipes((prev) =>
        prev.map((r) => {
          const before = byId.get(assetId)?.recipeId;
          if (r.id === recipeId) return { ...r, photoCount: r.photoCount + 1 };
          if (r.id === before) return { ...r, photoCount: Math.max(0, r.photoCount - 1) };
          return r;
        })
      );
      forgetFound(assetId);
      setEditingId(null);
      setAnnouncement(recipeId ? "Saved recipe used." : "Recipe unlinked. This photo keeps its own copy.");
      return null;
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
  }

  /** Saves a photo's recipe to the library and links the photo to it (DIG-24). */
  async function saveRecipeToLibrary(assetId: string, recipe: RecipeData): Promise<string | null> {
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe, linkAssetId: assetId }),
      });
      if (!res.ok) return await readApiError(res, "Could not save the recipe to your library.");
      const { recipe: saved } = (await res.json()) as { recipe: SavedRecipe };
      setSavedRecipes((prev) => [...prev, saved].sort((a, b) => a.recipe.name.localeCompare(b.recipe.name)));
      updateAsset(assetId, (a) => ({ ...a, kind: "recipe", recipe: saved.recipe, recipeId: saved.id }));
      setEditingId(null);
      setAnnouncement(`“${saved.recipe.name}” saved to your recipes.`);
      return null;
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
  }

  async function deleteAsset(asset: BoardAsset, index: number) {
    setBusyId(asset.id);
    setBoardError(null);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not delete the photo."));
      dropAsset(asset.id);
      setTotal((t) => Math.max(0, t - 1));
      forgetFound(asset.id);
      setAnnouncement(`${assetLabel(asset, index)} deleted.`);
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : "Could not delete the photo.");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  async function savePhotoEdit(asset: BoardAsset, edit: PhotoEdit | null): Promise<string | null> {
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edit }),
      });
      if (!res.ok) return await readApiError(res, "Could not save the edit.");
      const body = (await res.json()) as { asset: Parameters<typeof toBoardAsset>[0] };
      const updated = toBoardAsset(body.asset);
      // The response may carry a size read for the first time, which crops need.
      updateAsset(asset.id, (a) => ({ ...a, edit: updated.edit, width: updated.width, height: updated.height }));
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
    setPhotoEditId(null);
    setAnnouncement(edit ? "Photo edit saved." : "Photo edit reset.");
    return null;
  }

  async function saveName(asset: BoardAsset, name: string | null): Promise<string | null> {
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return await readApiError(res, "Could not save the name.");
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
    updateAsset(asset.id, (a) => ({ ...a, name }));
    setNamingId(null);
    setAnnouncement(name ? `Photo named “${name}”.` : "Photo name cleared.");
    return null;
  }

  async function moveAsset(asset: BoardAsset, index: number, targetId: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: targetId }),
      });
      if (!res.ok) return await readApiError(res, "Could not move the photo.");
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
    const target = otherBoards.find((b) => b.id === targetId);
    dropAsset(asset.id);
    setTotal((t) => Math.max(0, t - 1));
    setElsewhereBytes((bytes) => bytes + asset.sizeBytes);
    forgetFound(asset.id);
    setMovingId(null);
    setAnnouncement(`${assetLabel(asset, index)} moved to ${target?.name ?? "another board"}.`);
    return null;
  }

  const photoEditingIndex = assets.findIndex((a) => a.id === photoEditId);
  const photoEditing = byId.get(photoEditId ?? "") ?? null;
  const editingIndex = assets.findIndex((a) => a.id === editingId);
  const editing = byId.get(editingId ?? "") ?? null;
  const problem = boardError ? (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{boardError}</span>
      <button type="button" onClick={() => setBoardError(null)} className="shrink-0 text-xs font-medium underline underline-offset-2">
        Dismiss
      </button>
    </div>
  ) : null;

  function renderCard(asset: BoardAsset, index: number, layout: GridLayout | "strip", look: Partial<StripCardLook>) {
    const label = assetLabel(asset, index);
    const { dragId, dropIndex } = reorder;
    const showDropBefore = dragId !== null && dropIndex === index;
    const showDropAfter = dragId !== null && dropIndex === assets.length && index === assets.length - 1;
    const busy = busyId === asset.id;
    return (
      <PhotoCard
        key={asset.id}
        asset={asset}
        index={index}
        count={assets.length}
        label={label}
        dragging={dragId === asset.id}
        dropSide={showDropBefore ? "before" : showDropAfter ? "after" : null}
        layout={layout}
        {...look}
        held={reorder.heldId === asset.id}
        onToggleHeld={() => (reorder.heldId === asset.id ? reorder.dropHeld() : reorder.pickUp(index))}
        onCancelHeld={reorder.cancelHeld}
        onHoldAt={reorder.holdAt}
        columns={layout === "strip" ? () => 0 : gridColumns}
        keysHintId={`${inputId}-keys`}
        draggable={!busy}
        onDragStart={() => reorder.setDrag(asset.id)}
        onDragEnd={() => {
          reorder.setDrag(null);
          reorder.setDrop(null);
        }}
        onDragOverSide={(after) => {
          if (!reorder.isDragging()) return false;
          const gap = after ? index + 1 : index;
          if (reorder.currentDropIndex() !== gap) reorder.setDrop(gap);
          return true;
        }}
        onMoveBy={(delta) => reorder.moveBy(index, delta)}
        confirmingDelete={confirmDeleteId === asset.id}
        deleting={busy}
        onAskDelete={() => setConfirmDeleteId(asset.id)}
        onCancelDelete={() => setConfirmDeleteId(null)}
        onDelete={() => void deleteAsset(asset, index)}
        onRetryProcessing={() => void retryProcessing(asset)}
        onEditPhoto={() => setPhotoEditId(asset.id)}
        onEditRecipe={() => setEditingId(asset.id)}
        hasFoundRecipe={!asset.recipe && Boolean(foundRecipes[asset.id])}
        naming={namingId === asset.id}
        onToggleNaming={() => {
          setMovingId(null);
          setNamingId(namingId === asset.id ? null : asset.id);
        }}
        onSaveName={(name) => saveName(asset, name)}
        otherBoards={otherBoards}
        moving={movingId === asset.id}
        onToggleMoving={() => {
          setNamingId(null);
          setMovingId(movingId === asset.id ? null : asset.id);
        }}
        onMoveToBoard={(targetId) => moveAsset(asset, index, targetId)}
        usedIn={usedIn[asset.id] ?? []}
      />
    );
  }

  const dropZone = {
    onDragOver: (e: React.DragEvent) => {
      if (reorder.isDragging()) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      if (!reorder.isDragging()) return;
      e.preventDefault();
      reorder.handleDrop();
    },
  };

  const emptyBoard = (
    <div className="rounded-2xl border border-paper-300 bg-white px-6 py-14 text-center">
      <h2 className="font-serif text-xl font-bold text-ink-900">Your board is empty</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
        Add photos to start collecting ideas. Nothing on the board is public until you publish a zine.
      </p>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800"
      >
        <ImagePlus className="h-4 w-4" aria-hidden="true" />
        Add photos
      </button>
    </div>
  );

  return (
    <>
      <p id={`${inputId}-keys`} className="hidden">
        Press Space to pick up, arrow keys to move, Space to drop, Escape to cancel.
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <BoardBar
        boardId={boardId}
        name={boardName}
        total={total}
        view={view}
        views={wide ? ["free", "grid", "strip"] : ["grid", "strip"]}
        onView={chooseView}
        onRename={renameBoard}
        onUpload={() => fileInputRef.current?.click()}
      />

      {view === "free" ? (
        <>
          {uploads.length > 0 || problem ? (
            <div className="space-y-3 border-b border-paper-300 bg-paper-50 px-6 py-3">
              <UploadList uploads={uploads} onDismiss={dismiss} />
              {problem}
            </div>
          ) : null}
          <FreeformBoard
            boardId={boardId}
            assets={assets}
            findAsset={findAsset}
            layout={layout}
            trayRevision={`${total}:${assets.filter((a) => a.status === "ready").length}:${layout.savedCount}`}
            startAt={startAt}
            fileInputRef={fileInputRef}
            onFiles={enqueue}
            onKnown={(asset) => setExtras((prev) => (prev.some((a) => a.id === asset.id) ? prev : [...prev, asset]))}
            onEditPhoto={setPhotoEditId}
            onEditRecipe={setEditingId}
            onAnnounce={setAnnouncement}
          />
        </>
      ) : null}

      {view === "strip" ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            onChange={(e) => {
              if (e.target.files) enqueue(e.target.files);
              e.target.value = "";
            }}
          />
          {uploads.length > 0 || problem ? (
            <div className="space-y-3 border-b border-paper-300 bg-paper-50 px-6 py-3">
              <UploadList uploads={uploads} onDismiss={dismiss} />
              {problem}
            </div>
          ) : null}
          {assets.length === 0 ? (
            isUploading ? null : <div className="px-4 py-5 sm:px-7">{emptyBoard}</div>
          ) : (
            <BoardStrip
              assets={assets}
              total={total}
              startAt={startAt}
              heldId={reorder.heldId}
              keysHintId={`${inputId}-keys`}
              loadError={loadMoreError}
              onRetryLoad={() => void loadMore()}
              {...dropZone}
              renderCard={(asset, index, look) => renderCard(asset, index, "strip", look)}
            />
          )}
        </>
      ) : null}

      {view === "grid" ? (
      <div className="space-y-5 px-4 py-5 sm:px-7">

      <div className="grid items-center gap-4 lg:grid-cols-[1fr_18rem]">
        <UploadDropzone inputId={inputId} fileInputRef={fileInputRef} onFiles={enqueue} isReordering={reorder.isDragging} />
        <StorageMeter usedBytes={usedBytes} />
      </div>

      <UploadList uploads={uploads} onDismiss={dismiss} />

      {problem}

      {assets.length === 0 && !isUploading ? (
        emptyBoard
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div role="group" aria-label="Grid layout" className="flex gap-1.5">
              {GRID_LAYOUTS.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={gridLayout === l}
                  onClick={() => chooseLayout(l)}
                  className={`min-h-[34px] rounded-full border px-3.5 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500 ${gridLayout === l ? "border-ink-900 bg-ink-900 text-paper-50" : "border-paper-300 bg-white text-ink-900"}`}
                >
                  {GRID_LAYOUT_NAMES[l]}
                </button>
              ))}
            </div>
            <p className="text-[13px] text-ink-500">
              {assets.length < total ? <span>{`Showing ${assets.length} of ${total.toLocaleString("en-US")} photos. `}</span> : null}
              <span>Drag cards to change the order. The order is the zine&apos;s starting order.</span>
            </p>
          </div>
          <ol
            ref={masonry.listRef}
            aria-label="Vision Board photos"
            data-layout={gridLayout}
            style={masonry.listStyle}
            className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${gridLayout === "feature" ? "auto-rows-[minmax(248px,auto)]" : ""}`}
            {...dropZone}
          >
            {assets.map((asset, index) => renderCard(asset, index, gridLayout, { style: masonry.cardStyle(index) }))}
          </ol>
          {cursor ? (
            <LoadMore sentinelRef={sentinelRef} loading={loadingMore} error={loadMoreError} onLoadMore={() => void loadMore()} />
          ) : null}
        </>
      )}

      </div>
      ) : null}

      {photoEditing ? (
        <PhotoEditor
          open
          label={assetLabel(photoEditing, photoEditingIndex)}
          src={photoEditing.publicUrl}
          blurDataUrl={photoEditing.blurDataUrl}
          dims={photoEditing.width && photoEditing.height ? { width: photoEditing.width, height: photoEditing.height } : null}
          initial={photoEditing.edit}
          usedIn={usedIn[photoEditing.id] ?? []}
          onClose={() => setPhotoEditId(null)}
          onSave={(edit) => savePhotoEdit(photoEditing, edit)}
        />
      ) : null}

      <RecipeEditor
        open={editing !== null}
        assetLabel={editing ? assetLabel(editing, editingIndex) : ""}
        initial={editing?.recipe ?? null}
        prefill={editing && !editing.recipe ? (foundRecipes[editing.id] ?? null) : null}
        onClose={() => setEditingId(null)}
        onSave={(recipe) => (editing ? saveRecipe(editing.id, recipe) : Promise.resolve(null))}
        savedRecipes={savedRecipes}
        linkedRecipeId={editing?.recipeId ?? null}
        onLink={(recipeId) => (editing ? linkRecipe(editing.id, recipeId) : Promise.resolve(null))}
        onSaveToLibrary={(recipe) => (editing ? saveRecipeToLibrary(editing.id, recipe) : Promise.resolve(null))}
      />
    </>
  );
}
