"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Crop,
  FolderInput,
  GripVertical,
  ImagePlus,
  Loader2,
  Pencil,
  RotateCw,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import type { FoundRecipe } from "@/lib/fuji-makernote";
import type { RecipeData } from "@/lib/types";
import { assetLabel, exifBadges, moveItem } from "./board-utils";
import { checkUpload, formatBytes, MAX_UPLOAD_BYTES } from "@/lib/limits";
import type { PreparedUpload } from "@/lib/storage/types";
import { StorageMeter } from "./StorageMeter";
import { MovePhotoPanel } from "./MovePhotoPanel";
import { PhotoNameForm } from "./PhotoNameForm";
import { PhotoEditor } from "./PhotoEditor";
import { EditedPhoto } from "@/components/EditedPhoto";
import type { PhotoEdit } from "@/lib/photo-edit";
import { RecipeEditor } from "./RecipeEditor";
import {
  ACCEPTED_IMAGE_TYPES,
  readApiError,
  toBoardAsset,
  type BoardAsset,
} from "./types";

type UploadStage = "queued" | "reading" | "uploading" | "saving" | "error";

interface UploadItem {
  id: string;
  name: string;
  stage: UploadStage;
  error?: string;
}

const STAGE_LABEL: Record<UploadStage, string> = {
  queued: "Waiting",
  reading: "Reading EXIF",
  uploading: "Uploading",
  saving: "Saving to board",
  error: "Failed",
};

async function uploadOne(
  file: File,
  boardId: string,
  onStage: (stage: UploadStage) => void,
): Promise<{ asset: BoardAsset; foundRecipe: FoundRecipe | null }> {
  onStage("reading");
  // Loaded on demand so exifreader stays out of the board's initial bundle.
  const { extractExifFromFile } = await import("@/lib/exif-client");
  const { exif, foundRecipe } = await extractExifFromFile(file);

  onStage("uploading");
  const presign = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  });
  if (!presign.ok) {
    throw new Error(await readApiError(presign, "Could not prepare the upload."));
  }
  const prepared = (await presign.json()) as PreparedUpload;

  const put = await fetch(prepared.uploadUrl, {
    method: prepared.method,
    headers: prepared.headers,
    body: file,
  });
  if (!put.ok) {
    throw new Error(await readApiError(put, "The file upload failed."));
  }

  onStage("saving");
  const created = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageKey: prepared.storageKey,
      originalName: file.name,
      mimeType: file.type,
      kind: "photo",
      exif,
      boardId,
    }),
  });
  if (!created.ok) {
    throw new Error(await readApiError(created, "The photo uploaded but could not be saved."));
  }
  const body = (await created.json()) as { asset: Parameters<typeof toBoardAsset>[0] };
  return { asset: toBoardAsset(body.asset), foundRecipe };
}

export interface VisionBoardProps {
  /** The board on screen (DIG-25). Uploads land here. */
  boardId: string;
  initialAssets: BoardAsset[];
  /** The creator's other boards, for moving photos. */
  otherBoards: { id: string; name: string }[];
  /** Bytes stored on the other boards; storage is one quota for the account. */
  otherBoardsBytes: number;
  /** Titles of the zines whose pages use each photo, by photo id. */
  usedIn: Record<string, string[]>;
}

export function VisionBoard({ boardId, initialAssets, otherBoards, otherBoardsBytes, usedIn }: VisionBoardProps) {
  const [assets, setAssets] = useState<BoardAsset[]>(initialAssets);
  const [elsewhereBytes, setElsewhereBytes] = useState(otherBoardsBytes);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [namingId, setNamingId] = useState<string | null>(null);
  const [photoEditId, setPhotoEditId] = useState<string | null>(null);
  const usedBytes = elsewhereBytes + assets.reduce((sum, a) => sum + a.sizeBytes, 0);

  // While any photo is processing, check the server every few seconds and swap in the result
  // (DIG-26). Only processing photos are touched, so local edits are never overwritten.
  const pendingIds = assets
    .filter((a) => a.status === "processing")
    .map((a) => a.id)
    .join(",");
  useEffect(() => {
    if (!pendingIds) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/assets?boardId=${encodeURIComponent(boardId)}`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const body = (await res.json()) as { assets: Parameters<typeof toBoardAsset>[0][] };
        const fresh = new Map(body.assets.map((raw) => [raw.id, toBoardAsset(raw)]));
        if (stopped) return;
        setAssets((prev) =>
          prev.map((a) => {
            const next = fresh.get(a.id);
            if (a.status !== "processing" || !next || next.status === "processing") return a;
            return {
              ...a,
              status: next.status,
              publicUrl: next.publicUrl,
              sizeBytes: next.sizeBytes,
              processingError: next.processingError,
              blurDataUrl: next.blurDataUrl,
            };
          })
        );
      } catch {
        // Offline for a moment; the next tick tries again.
      }
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pendingIds, boardId]);

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
  /** Recipes read from a photo at upload, held until the creator names and saves one. */
  const [foundRecipes, setFoundRecipes] = useState<Record<string, FoundRecipe>>({});
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [boardError, setBoardError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dropzoneActive, setDropzoneActive] = useState(false);
  // Drag handlers read refs: drag events can fire before React re-renders with new state.
  const dragIdRef = useRef<string | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const queueRef = useRef<{ id: string; file: File }[]>([]);
  const inputId = useId();

  const isUploading = uploads.some((u) => u.stage !== "error");

  function forgetFound(id: string) {
    setFoundRecipes((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const updateUpload = (id: string, patch: Partial<UploadItem>) =>
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  // Uploads run one at a time so each new asset gets the next sort order.
  const drainQueue = useCallback(async () => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    let added = 0;
    let found = 0;
    while (queueRef.current.length > 0) {
      const { id, file } = queueRef.current.shift()!;
      try {
        const { asset, foundRecipe } = await uploadOne(file, boardId, (stage) => updateUpload(id, { stage }));
        setAssets((prev) => [...prev, asset]);
        if (foundRecipe) {
          found += 1;
          setFoundRecipes((prev) => ({ ...prev, [asset.id]: foundRecipe }));
        }
        setUploads((prev) => prev.filter((u) => u.id !== id));
        added += 1;
      } catch (err) {
        updateUpload(id, {
          stage: "error",
          error: err instanceof Error ? err.message : "Upload failed.",
        });
      }
    }
    uploadingRef.current = false;
    if (added > 0) {
      const review =
        found === 0
          ? ""
          : found === 1
            ? " A film recipe was found in one photo. Review it before saving."
            : ` Film recipes were found in ${found} photos. Review them before saving.`;
      setAnnouncement(`${added} photo${added === 1 ? "" : "s"} added to the board.${review}`);
    }
  }, [boardId]);

  function enqueue(files: FileList | File[]) {
    const items: UploadItem[] = [];
    // The server has the final say; this saves uploading a file it would refuse.
    let committedBytes = usedBytes;
    for (const file of Array.from(files)) {
      const id = `${file.name}-${file.size}-${crypto.randomUUID()}`;
      if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
        items.push({ id, name: file.name, stage: "error", error: "Only JPEG, PNG, WebP, GIF, or AVIF images." });
        continue;
      }
      const check = checkUpload({ size: file.size, usedBytes: committedBytes });
      if (!check.ok) {
        items.push({ id, name: file.name, stage: "error", error: check.message });
        continue;
      }
      committedBytes += file.size;
      items.push({ id, name: file.name, stage: "queued" });
      queueRef.current.push({ id, file });
    }
    if (items.length === 0) return;
    setUploads((prev) => [...prev, ...items]);
    void drainQueue();
  }

  async function persistOrder(next: BoardAsset[], previous: BoardAsset[], message: string) {
    setAssets(next);
    setBoardError(null);
    try {
      const res = await fetch("/api/assets/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((a) => a.id) }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not save the new order."));
      setAnnouncement(message);
    } catch (err) {
      setAssets(previous);
      setBoardError(err instanceof Error ? err.message : "Could not save the new order.");
    }
  }

  function moveBy(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= assets.length) return;
    const next = moveItem(assets, index, target);
    void persistOrder(
      next,
      assets,
      `${assetLabel(assets[index], index)} moved to position ${target + 1} of ${assets.length}.`
    );
  }

  function setDrag(id: string | null) {
    dragIdRef.current = id;
    setDragId(id);
  }

  function setDrop(index: number | null) {
    dropIndexRef.current = index;
    setDropIndex(index);
  }

  function handleDrop() {
    const currentDrag = dragIdRef.current;
    const gap = dropIndexRef.current;
    setDrag(null);
    setDrop(null);
    if (currentDrag === null || gap === null) return;
    const from = assets.findIndex((a) => a.id === currentDrag);
    // `gap` is a gap index (0..length); convert it to the final position.
    const to = gap > from ? gap - 1 : gap;
    if (from < 0 || from === to) return;
    void persistOrder(
      moveItem(assets, from, to),
      assets,
      `${assetLabel(assets[from], from)} moved to position ${to + 1} of ${assets.length}.`
    );
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

  async function deleteAsset(asset: BoardAsset, index: number) {
    setBusyId(asset.id);
    setBoardError(null);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not delete the photo."));
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
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

      <section
        aria-label="Add photos"
        onDragOver={(e) => {
          if (dragIdRef.current) return;
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            setDropzoneActive(true);
          }
        }}
        onDragLeave={() => setDropzoneActive(false)}
        onDrop={(e) => {
          if (dragIdRef.current) return;
          e.preventDefault();
          setDropzoneActive(false);
          if (e.dataTransfer.files.length > 0) enqueue(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed px-5 py-6 text-center transition sm:py-8 ${
          dropzoneActive ? "border-vermilion-500 bg-vermilion-500/5" : "border-paper-300 bg-paper-100/60"
        }`}
      >
        <ImagePlus className="mx-auto h-7 w-7 text-vermilion-500" aria-hidden="true" />
        <p className="mt-2 text-sm text-ink-700">
          Drop photos here, or{" "}
          <label htmlFor={inputId} className="cursor-pointer font-semibold text-vermilion-600 underline underline-offset-2 hover:text-vermilion-500">
            choose files
          </label>
          .
        </p>
        <p className="mt-1 text-xs text-ink-500">
          JPEG, PNG, WebP, GIF, or AVIF up to {formatBytes(MAX_UPLOAD_BYTES)}. Camera EXIF is read on your device before upload.
        </p>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          multiple
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) enqueue(e.target.files);
            e.target.value = "";
          }}
        />
      </section>
      <StorageMeter usedBytes={usedBytes} />

      {uploads.length > 0 ? (
        <ul aria-label="Uploads" className="space-y-2">
          {uploads.map((u) => (
            <li
              key={u.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                u.stage === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-paper-300 bg-white text-ink-700"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {u.stage === "error" ? null : (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-vermilion-500" aria-hidden="true" />
                )}
                <span className="truncate">{u.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-xs">
                <span role={u.stage === "error" ? "alert" : undefined}>
                  {u.stage === "error" ? u.error : STAGE_LABEL[u.stage]}
                </span>
                {u.stage === "error" ? (
                  <button
                    type="button"
                    onClick={() => setUploads((prev) => prev.filter((x) => x.id !== u.id))}
                    className="font-medium underline underline-offset-2"
                  >
                    Dismiss
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

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
            {assets.length} photo{assets.length === 1 ? "" : "s"}. Drag a card, or use its arrow buttons, to change the order.
          </p>
          <ol
            aria-label="Vision Board photos"
            aria-describedby={`${inputId}-order-hint`}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            onDragOver={(e) => {
              if (dragIdRef.current) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!dragIdRef.current) return;
              e.preventDefault();
              handleDrop();
            }}
          >
            {assets.map((asset, index) => {
              const label = assetLabel(asset, index);
              const badges = exifBadges(asset.exif);
              const camera = [asset.exif?.cameraMake, asset.exif?.cameraModel].filter(Boolean).join(" ");
              const isDragging = dragId === asset.id;
              const showDropBefore = dragId !== null && dropIndex === index;
              const showDropAfter = dragId !== null && dropIndex === assets.length && index === assets.length - 1;
              const confirming = confirmDeleteId === asset.id;
              const busy = busyId === asset.id;
              const foundRecipe = asset.recipe ? undefined : foundRecipes[asset.id];

              return (
                <li
                  key={asset.id}
                  draggable={!busy}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", asset.id);
                    setDrag(asset.id);
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setDrop(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragIdRef.current) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const rect = e.currentTarget.getBoundingClientRect();
                    const after = e.clientX > rect.left + rect.width / 2;
                    const gap = after ? index + 1 : index;
                    if (dropIndexRef.current !== gap) setDrop(gap);
                  }}
                  className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                    asset.edit?.cardSize === "large" ? "sm:col-span-2" : ""
                  } ${
                    isDragging ? "opacity-40" : ""
                  } ${showDropBefore ? "ring-2 ring-vermilion-500 ring-offset-2 ring-offset-paper-50" : ""} ${
                    showDropAfter ? "ring-2 ring-vermilion-500 ring-offset-2 ring-offset-paper-50" : ""
                  } border-paper-300`}
                >
                  <div className="relative bg-ink-900">
                    {asset.status === "ready" ? (
                      <EditedPhoto
                        src={asset.publicUrl}
                        alt={label}
                        edit={asset.edit}
                        dims={asset.width && asset.height ? { width: asset.width, height: asset.height } : null}
                        sizes={
                          asset.edit?.cardSize === "large"
                            ? "(max-width: 640px) 100vw, (max-width: 1280px) 66vw, 50vw"
                            : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                        }
                        blurDataUrl={asset.blurDataUrl}
                      />
                    ) : asset.status === "processing" ? (
                      <div
                        role="status"
                        className="flex aspect-[4/5] flex-col items-center justify-center gap-2 px-4 text-center text-paper-50"
                      >
                        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                        <span className="text-xs">
                          Processing <span className="sr-only">{label}</span>…
                        </span>
                      </div>
                    ) : (
                      <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 px-4 text-center text-paper-50">
                        <p className="text-xs">{asset.processingError ?? "This photo could not be processed."}</p>
                        <button
                          type="button"
                          onClick={() => void retryProcessing(asset)}
                          aria-label={`Retry processing ${label}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-paper-50 px-3.5 py-1.5 text-xs font-semibold text-ink-900 shadow hover:bg-white"
                        >
                          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                          Retry
                        </button>
                      </div>
                    )}
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[11px] text-paper-50 backdrop-blur-sm">
                      <GripVertical className="h-3 w-3" aria-hidden="true" />
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {asset.kind === "recipe" && asset.recipe ? (
                      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-paper-50/95 px-2.5 py-1 text-[11px] font-semibold text-ink-900 shadow">
                        <SlidersHorizontal className="h-3 w-3 text-vermilion-500" aria-hidden="true" />
                        Recipe
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900" title={label}>
                        {label}
                      </p>
                      {asset.name?.trim() && asset.originalName ? (
                        <p className="truncate font-mono text-[11px] text-ink-500" title={asset.originalName}>
                          {asset.originalName}
                        </p>
                      ) : null}
                      {asset.kind === "recipe" && asset.recipe ? (
                        <p className="truncate font-serif text-sm text-ink-700" title={`${asset.recipe.name} · ${asset.recipe.filmSimulation}`}>
                          {asset.recipe.name} <span className="font-sans text-xs text-ink-500">· {asset.recipe.filmSimulation}</span>
                        </p>
                      ) : null}
                    </div>

                    <div aria-label="Camera EXIF" className="flex flex-wrap gap-1.5">
                      {badges.length > 0 ? (
                        badges.map((b) => (
                          <span key={b} className="rounded-md bg-paper-100 px-2 py-0.5 font-mono text-[11px] text-ink-700">
                            {b}
                          </span>
                        ))
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-paper-100 px-2 py-0.5 font-mono text-[11px] text-ink-500">
                          <Camera className="h-3 w-3" aria-hidden="true" />
                          No EXIF
                        </span>
                      )}
                    </div>
                    {camera ? <p className="truncate font-mono text-[11px] text-ink-500">{camera}</p> : null}

                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-paper-200 pt-3">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveBy(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${label} earlier`}
                          className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100 disabled:opacity-30"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBy(index, 1)}
                          disabled={index === assets.length - 1}
                          aria-label={`Move ${label} later`}
                          className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100 disabled:opacity-30"
                        >
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      {confirming ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-ink-700">Delete?</span>
                          <button
                            type="button"
                            onClick={() => void deleteAsset(asset, index)}
                            disabled={busy}
                            aria-busy={busy}
                            className="rounded-lg bg-red-700 px-2.5 py-1 font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
                          >
                            {busy ? "Deleting…" : "Delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={busy}
                            className="font-medium text-ink-700 underline underline-offset-2"
                          >
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {asset.status === "ready" ? (
                            <button
                              type="button"
                              onClick={() => setPhotoEditId(asset.id)}
                              aria-label={`Edit ${label}`}
                              className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100"
                            >
                              <Crop className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setMovingId(null);
                              setNamingId(namingId === asset.id ? null : asset.id);
                            }}
                            aria-label={`Rename ${label}`}
                            aria-expanded={namingId === asset.id}
                            className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          {otherBoards.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setNamingId(null);
                                setMovingId(movingId === asset.id ? null : asset.id);
                              }}
                              aria-label={`Move ${label} to another board`}
                              aria-expanded={movingId === asset.id}
                              className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100"
                            >
                              <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setEditingId(asset.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-paper-300 px-2.5 py-1.5 text-xs font-medium text-ink-800 transition hover:bg-paper-100"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5 text-vermilion-500" aria-hidden="true" />
                            {asset.recipe ? "Edit recipe" : foundRecipe ? "Review recipe found in photo" : "Add recipe"}
                            <span className="sr-only"> for {label}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(asset.id)}
                            aria-label={`Delete ${label}`}
                            className="rounded-lg border border-paper-300 p-1.5 text-ink-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                    {namingId === asset.id ? (
                      <PhotoNameForm
                        fileName={asset.originalName}
                        initialName={asset.name}
                        onSave={(name) => saveName(asset, name)}
                        onCancel={() => setNamingId(null)}
                      />
                    ) : null}
                    {movingId === asset.id ? (
                      <MovePhotoPanel
                        label={label}
                        boards={otherBoards}
                        usedIn={usedIn[asset.id] ?? []}
                        onMove={(targetId) => moveAsset(asset, index, targetId)}
                        onCancel={() => setMovingId(null)}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
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
      />
    </div>
  );
}
