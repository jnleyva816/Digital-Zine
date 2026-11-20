"use client";

import type { DragEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Crop,
  FolderInput,
  GripVertical,
  Loader2,
  Pencil,
  RotateCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { EditedPhoto } from "@/components/EditedPhoto";
import { Windowed } from "@/components/Windowed";
import { exifBadges } from "./board-utils";
import { MovePhotoPanel } from "./MovePhotoPanel";
import { PhotoNameForm } from "./PhotoNameForm";
import type { BoardAsset } from "./types";

export interface PhotoCardProps {
  asset: BoardAsset;
  index: number;
  count: number;
  label: string;
  /** Drag and drop state for this card. */
  dragging: boolean;
  dropHighlight: boolean;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  /** Called while a card is dragged over this one, with which side the pointer is on. */
  onDragOverSide: (after: boolean) => boolean;
  onMoveBy: (delta: number) => void;
  /** Delete confirmation. */
  confirmingDelete: boolean;
  deleting: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onRetryProcessing: () => void;
  onEditPhoto: () => void;
  onEditRecipe: () => void;
  /** Whether a recipe was read from the photo and is waiting for review. */
  hasFoundRecipe: boolean;
  /** Rename panel. */
  naming: boolean;
  onToggleNaming: () => void;
  onSaveName: (name: string | null) => Promise<string | null>;
  /** Move-to-board panel; hidden when the creator has no other board. */
  otherBoards: { id: string; name: string }[];
  moving: boolean;
  onToggleMoving: () => void;
  onMoveToBoard: (boardId: string) => Promise<string | null>;
  usedIn: string[];
}

/** One photo on the Vision Board, with its actions (DIG-47, moved out of VisionBoard). */
export function PhotoCard(props: PhotoCardProps) {
  const { asset, index, count, label } = props;
  const badges = exifBadges(asset.exif);
  const camera = [asset.exif?.cameraMake, asset.exif?.cameraModel].filter(Boolean).join(" ");

  return (
    <li
      draggable={props.draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", asset.id);
        props.onDragStart();
      }}
      onDragEnd={props.onDragEnd}
      onDragOver={(e: DragEvent<HTMLLIElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (!props.onDragOverSide(e.clientX > rect.left + rect.width / 2)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
        asset.edit?.cardSize === "large" ? "sm:col-span-2" : ""
      } ${props.dragging ? "opacity-40" : ""} ${
        props.dropHighlight ? "ring-2 ring-vermilion-500 ring-offset-2 ring-offset-paper-50" : ""
      } border-paper-300`}
    >
      <Windowed label={label}>
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
            <div role="status" className="flex aspect-[4/5] flex-col items-center justify-center gap-2 px-4 text-center text-paper-50">
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
                onClick={props.onRetryProcessing}
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
                onClick={() => props.onMoveBy(-1)}
                disabled={index === 0}
                aria-label={`Move ${label} earlier`}
                className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100 disabled:opacity-30"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => props.onMoveBy(1)}
                disabled={index === count - 1}
                aria-label={`Move ${label} later`}
                className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100 disabled:opacity-30"
              >
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {props.confirmingDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-ink-700">Delete?</span>
                <button
                  type="button"
                  onClick={props.onDelete}
                  disabled={props.deleting}
                  aria-busy={props.deleting}
                  className="rounded-lg bg-red-700 px-2.5 py-1 font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
                >
                  {props.deleting ? "Deleting…" : "Delete"}
                </button>
                <button
                  type="button"
                  onClick={props.onCancelDelete}
                  disabled={props.deleting}
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
                    onClick={props.onEditPhoto}
                    aria-label={`Edit ${label}`}
                    className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100"
                  >
                    <Crop className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={props.onToggleNaming}
                  aria-label={`Rename ${label}`}
                  aria-expanded={props.naming}
                  className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {props.otherBoards.length > 0 ? (
                  <button
                    type="button"
                    onClick={props.onToggleMoving}
                    aria-label={`Move ${label} to another board`}
                    aria-expanded={props.moving}
                    className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100"
                  >
                    <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={props.onEditRecipe}
                  className="inline-flex items-center gap-1 rounded-lg border border-paper-300 px-2.5 py-1.5 text-xs font-medium text-ink-800 transition hover:bg-paper-100"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-vermilion-500" aria-hidden="true" />
                  {asset.recipe ? "Edit recipe" : props.hasFoundRecipe ? "Review recipe found in photo" : "Add recipe"}
                  <span className="sr-only"> for {label}</span>
                </button>
                <button
                  type="button"
                  onClick={props.onAskDelete}
                  aria-label={`Delete ${label}`}
                  className="rounded-lg border border-paper-300 p-1.5 text-ink-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          {props.naming ? (
            <PhotoNameForm
              fileName={asset.originalName}
              initialName={asset.name}
              onSave={props.onSaveName}
              onCancel={props.onToggleNaming}
            />
          ) : null}
          {props.moving ? (
            <MovePhotoPanel
              label={label}
              boards={props.otherBoards}
              usedIn={props.usedIn}
              onMove={props.onMoveToBoard}
              onCancel={props.onToggleMoving}
            />
          ) : null}
        </div>
      </Windowed>
    </li>
  );
}
