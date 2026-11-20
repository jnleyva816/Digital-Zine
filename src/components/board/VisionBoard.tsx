"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import type { FoundRecipe } from "@/lib/fuji-makernote";
import type { RecipeData } from "@/lib/types";
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
import { useBoardPaging } from "./useBoardPaging";
import { useBoardReorder } from "./useBoardReorder";
import { useProcessingPoll } from "./useProcessingPoll";
import { useUploadQueue } from "./useUploadQueue";
import { readApiError, toBoardAsset, type BoardAsset } from "./types";

export interface VisionBoardProps {
  /** The board on screen (DIG-25). Uploads land here. */
  boardId: string;
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

/**
 * The Vision Board: uploads, the photo grid, and each photo's actions. Uploading, paging, the
 * processing poll, and reordering live in their own hooks, and each card in PhotoCard (DIG-47).
 */
export function VisionBoard({
  boardId,
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

  const reorder = useBoardReorder({ assets, setAssets, onAnnounce: setAnnouncement, onError: setBoardError });

  async function retryProcessing(asset: BoardAsset) {
    setBoardError(null);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}/process`, { method: "POST" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not retry processing."));
      const body = (await res.json()) as { asset: Parameters<typeof toBoardAsset>[0] };
      const updated = toBoardAsset(body.asset);
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, ...updated, recipe: a.recipe } : a)));
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
      setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
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
      setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, kind: updated.kind, recipe: updated.recipe, recipeId: updated.recipeId } : a)));
      setSavedRecipes((prev) =>
        prev.map((r) => {
          const before = assets.find((a) => a.id === assetId)?.recipeId;
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
      setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, kind: "recipe", recipe: saved.recipe, recipeId: saved.id } : a)));
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
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
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
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, edit: updated.edit, width: updated.width, height: updated.height } : a))
      );
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
    setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, name } : a)));
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
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    setElsewhereBytes((bytes) => bytes + asset.sizeBytes);
    forgetFound(asset.id);
    setMovingId(null);
    setAnnouncement(`${assetLabel(asset, index)} moved to ${target?.name ?? "another board"}.`);
    return null;
  }

  const photoEditingIndex = assets.findIndex((a) => a.id === photoEditId);
  const photoEditing = photoEditingIndex >= 0 ? assets[photoEditingIndex] : null;
  const editingIndex = assets.findIndex((a) => a.id === editingId);
  const editing = editingIndex >= 0 ? assets[editingIndex] : null;

  return (
    <div className="space-y-6">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <UploadDropzone inputId={inputId} fileInputRef={fileInputRef} onFiles={enqueue} isReordering={reorder.isDragging} />
      <StorageMeter usedBytes={usedBytes} />

      <UploadList uploads={uploads} onDismiss={dismiss} />

      {boardError ? (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{boardError}</span>
          <button type="button" onClick={() => setBoardError(null)} className="shrink-0 text-xs font-medium underline underline-offset-2">
            Dismiss
          </button>
        </div>
      ) : null}

      {assets.length === 0 && !isUploading ? (
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
      ) : (
        <>
          <p className="text-xs text-ink-500" id={`${inputId}-order-hint`}>
            {assets.length < total
              ? `Showing ${assets.length} of ${total.toLocaleString("en-US")} photos.`
              : `${assets.length} photo${assets.length === 1 ? "" : "s"}.`}{" "}
            Drag a card, or use its arrow buttons, to change the order.
          </p>
          <ol
            aria-label="Vision Board photos"
            aria-describedby={`${inputId}-order-hint`}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            onDragOver={(e) => {
              if (reorder.isDragging()) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!reorder.isDragging()) return;
              e.preventDefault();
              reorder.handleDrop();
            }}
          >
            {assets.map((asset, index) => {
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
                  dropHighlight={showDropBefore || showDropAfter}
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
            })}
          </ol>
          {cursor ? (
            <LoadMore sentinelRef={sentinelRef} loading={loadingMore} error={loadMoreError} onLoadMore={() => void loadMore()} />
          ) : null}
        </>
      )}

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
    </div>
  );
}
