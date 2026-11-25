"use client";

import type { CSSProperties, DragEvent, KeyboardEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Crop,
  FolderInput,
  Loader2,
  Pencil,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { EditedPhoto } from "@/components/EditedPhoto";
import { Windowed } from "@/components/Windowed";
import type { GridLayout } from "@/lib/board-layout";
import { DEFAULT_EDIT, targetAspect } from "@/lib/photo-edit";
import { photoMeta } from "./board-utils";
import { MovePhotoPanel } from "./MovePhotoPanel";
import { PhotoNameForm } from "./PhotoNameForm";
import type { BoardAsset } from "./types";

export interface PhotoCardProps {
  asset: BoardAsset;
  index: number;
  count: number;
  label: string;
  layout: GridLayout;
  /** Where Masonry puts the card. */
  style?: CSSProperties;
  /** Picked up from the keyboard. */
  held: boolean;
  onToggleHeld: () => void;
  onCancelHeld: () => void;
  onHoldAt: (index: number) => void;
  /** How many columns the grid has now: how far up and down move a held card. */
  columns: () => number;
  /** The element that explains the reorder keys. */
  keysHintId?: string;
  /** Drag and drop state for this card. */
  dragging: boolean;
  /** Which edge of this card the dragged one would land at. */
  dropSide: "before" | "after" | null;
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

  function reorderKeys(e: KeyboardEvent) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      props.onToggleHeld();
      return;
    }
    if (!props.held) return;
    if (e.key === "Escape") return props.onCancelHeld();
    const target = {
      ArrowLeft: () => index - 1,
      ArrowRight: () => index + 1,
      ArrowUp: () => index - props.columns(),
      ArrowDown: () => index + props.columns(),
      Home: () => 0,
      End: () => count - 1,
    }[e.key];
    if (!target) return;
    e.preventDefault();
    props.onHoldAt(target());
  }

  const { layout } = props;
  const large = asset.edit?.cardSize === "large";
  const featured = layout === "feature" && index === 0;
  const twoByTwo = featured || (large && layout !== "masonry");
  // In Even and Feature the photo fills its cell; in Masonry it keeps its own shape.
  const photoBox =
    layout === "masonry" ? "" : layout === "even" ? "aspect-[4/5] w-full grow overflow-hidden" : "min-h-[188px] grow overflow-hidden";
  const stateBox = layout === "masonry" ? "aspect-[4/5]" : "absolute inset-0";
  const dims = asset.width && asset.height ? { width: asset.width, height: asset.height } : null;
  const meta = photoMeta(asset);

  return (
    <li
      data-asset-id={asset.id}
      draggable={props.draggable}
      style={props.style}
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
      className={`group relative flex min-w-0 flex-col rounded-xl border bg-paper-50 ${twoByTwo ? "col-span-2 row-span-2" : large ? "col-span-2" : ""} ${
        props.dragging ? "opacity-40" : ""
      } ${props.held ? "z-20 border-vermilion-500 shadow-xl ring-2 ring-vermilion-500" : "border-paper-300"}`}
    >
      {props.dropSide ? (
        <span
          data-testid="drop-marker"
          data-side={props.dropSide}
          aria-hidden="true"
          className={`absolute inset-y-0 z-30 w-1 rounded-full bg-vermilion-500 ${props.dropSide === "before" ? "-left-2.5" : "-right-2.5"}`}
        />
      ) : null}
      <Windowed label={label}>
        <div className={`relative rounded-t-[11px] bg-ink-900 ${photoBox || "overflow-hidden"}`} {...(photoBox ? { "data-testid": "photo-cover" } : {})}>
          {asset.status === "ready" ? (
            layout === "masonry" ? (
              <EditedPhoto
                src={asset.publicUrl}
                alt={label}
                edit={asset.edit}
                dims={dims}
                sizes={large ? "(max-width: 640px) 100vw, 40vw" : "(max-width: 640px) 50vw, 20vw"}
                blurDataUrl={asset.blurDataUrl}
              />
            ) : (
              <CoverPhoto
                asset={asset}
                label={label}
                dims={dims}
                sizes={twoByTwo ? "(max-width: 640px) 100vw, 50vw" : "(max-width: 640px) 60vw, 25vw"}
              />
            )
          ) : asset.status === "processing" ? (
            <div role="status" className={`flex flex-col items-center justify-center gap-2 px-4 text-center text-paper-50 ${stateBox}`}>
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              <span className="text-xs">
                Processing <span className="sr-only">{label}</span>…
              </span>
            </div>
          ) : (
            <div className={`flex flex-col items-center justify-center gap-3 px-4 pt-6 text-center text-paper-50 ${stateBox}`}>
              <p className="text-xs">{asset.processingError ?? "This photo could not be processed."}</p>
              <button
                type="button"
                onClick={props.onRetryProcessing}
                aria-label={`Retry processing ${label}`}
                className="relative z-10 inline-flex items-center gap-1.5 rounded-full bg-paper-50 px-3.5 py-1.5 text-xs font-semibold text-ink-900 shadow hover:bg-white"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}
          {/* A div, not a button: Firefox will not start a drag from a button. */}
          <div
            role="button"
            tabIndex={0}
            aria-label={`Reorder ${label}, position ${index + 1} of ${count}`}
            aria-pressed={props.held}
            aria-describedby={props.keysHintId}
            onKeyDown={reorderKeys}
            onClick={(e) => {
              // A screen reader's click; the pointer drags instead.
              if (e.detail === 0) props.onToggleHeld();
            }}
            onBlur={() => props.held && props.onCancelHeld()}
            className="absolute inset-0 cursor-grab rounded-t-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vermilion-500"
          />
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-ink-900/80 px-[7px] py-[3px] font-mono text-[10.5px] leading-none text-paper-50">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        {/* With a mouse, the actions lie over the photo's foot on hover or focus. Touch screens always show them. */}
        <div className="relative">
          <div className="flex flex-wrap justify-center gap-1 p-1.5 transition-opacity [@media(hover:hover)]:absolute [@media(hover:hover)]:inset-x-0 [@media(hover:hover)]:bottom-0 [@media(hover:hover)]:opacity-0 group-focus-within:!opacity-100 group-hover:!opacity-100">
            <Action label={`Move ${label} earlier`} icon={ArrowLeft} onClick={() => props.onMoveBy(-1)} disabled={index === 0} />
            <Action label={`Move ${label} later`} icon={ArrowRight} onClick={() => props.onMoveBy(1)} disabled={index === count - 1} />
            {asset.status === "ready" ? <Action label={`Edit ${label}`} icon={Crop} onClick={props.onEditPhoto} /> : null}
            <Action
              label={`${asset.recipe ? "Edit recipe" : props.hasFoundRecipe ? "Review recipe found in photo" : "Add recipe"} for ${label}`}
              icon={SlidersHorizontal}
              onClick={props.onEditRecipe}
            />
            <Action label={`Rename ${label}`} icon={Pencil} onClick={props.onToggleNaming} expanded={props.naming} />
            {props.otherBoards.length > 0 ? (
              <Action label={`Move ${label} to another board`} icon={FolderInput} onClick={props.onToggleMoving} expanded={props.moving} />
            ) : null}
            <Action label={`Delete ${label}`} icon={Trash2} onClick={props.onAskDelete} />
          </div>
        </div>

        <div className="flex flex-col gap-[3px] px-2.5 pb-2.5 pt-[9px]">
          <p className="truncate text-[13px] font-semibold leading-tight text-ink-900" title={label}>
            {label}
          </p>
          <p className="truncate font-mono text-[10.5px] leading-tight text-ink-500" title={meta}>
            {meta}
          </p>
          {props.hasFoundRecipe && !asset.recipe ? <p className="text-xs text-vermilion-600">Recipe found in this photo</p> : null}
          {props.confirmingDelete ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
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
              <button type="button" onClick={props.onCancelDelete} disabled={props.deleting} className="font-medium text-ink-700 underline underline-offset-2">
                Keep
              </button>
            </div>
          ) : null}
          {props.naming ? (
            <PhotoNameForm fileName={asset.originalName} initialName={asset.name} onSave={props.onSaveName} onCancel={props.onToggleNaming} />
          ) : null}
          {props.moving ? (
            <MovePhotoPanel label={label} boards={props.otherBoards} usedIn={props.usedIn} onMove={props.onMoveToBoard} onCancel={props.onToggleMoving} />
          ) : null}
        </div>
      </Windowed>
    </li>
  );
}

function Action({ label, icon: Icon, onClick, disabled, expanded }: { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; expanded?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-paper-300 bg-paper-50 text-ink-800 hover:bg-paper-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-vermilion-500 disabled:text-ink-500/40"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/** The photo's crop, filling a cell of another shape. Its frame is left off: the cell would cut it. */
function CoverPhoto({ asset, label, dims, sizes }: { asset: BoardAsset; label: string; dims: { width: number; height: number } | null; sizes: string }) {
  const edit = { ...(asset.edit ?? DEFAULT_EDIT), frame: "none" as const };
  return (
    <div className="absolute inset-0 [container-type:size]">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: `max(100cqw, calc(100cqh * ${targetAspect(edit, dims)}))` }}>
        <EditedPhoto src={asset.publicUrl} alt={label} edit={edit} dims={dims} sizes={sizes} blurDataUrl={asset.blurDataUrl} />
      </div>
    </div>
  );
}
