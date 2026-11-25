"use client";

import { memo } from "react";
import { EditedPhoto } from "@/components/EditedPhoto";
import type { Placement } from "@/lib/board-layout";
import type { Corner } from "@/lib/freeform";
import { DEFAULT_EDIT, frameLayout } from "@/lib/photo-edit";
import type { BoardAsset } from "./types";

const BORDER = 8;
const LABEL_HEIGHT = 28;

const dimsOf = (asset: BoardAsset) => (asset.width && asset.height ? { width: asset.width, height: asset.height } : null);

/** How tall a placed photo is: the creator's crop, plus a print's border and its handwritten name. */
export function placedHeight(asset: BoardAsset, width: number, look: Placement["look"]): number {
  const { aspect } = frameLayout(asset.edit ?? DEFAULT_EDIT, dimsOf(asset));
  return look === "print" ? (width - BORDER * 2) / aspect + BORDER + LABEL_HEIGHT : width / aspect;
}

export const placedTransform = (p: { x: number; y: number; rotation: number }, lifted = false) =>
  `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg)${lifted ? " scale(1.03)" : ""}`;

interface PlacedPhotoProps {
  asset: BoardAsset;
  placement: Placement;
  label: string;
  position: string;
  selected: boolean;
  animate: boolean;
  onFocus: (assetId: string) => void;
  onPointerDown: (assetId: string, e: React.PointerEvent<HTMLElement>) => void;
  onResizeStart: (assetId: string, corner: Corner, e: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (assetId: string, e: React.KeyboardEvent) => void;
}

const CORNERS: Record<Corner, string> = {
  tl: "-left-2.5 -top-2.5 cursor-nwse-resize",
  tr: "-right-2.5 -top-2.5 cursor-nesw-resize",
  bl: "-bottom-2.5 -left-2.5 cursor-nesw-resize",
  br: "-bottom-2.5 -right-2.5 cursor-nwse-resize",
};

/** One photo on the free-form board (DIG-87). Memoized: dragging one of 300 re-renders none of the others. */
export const PlacedPhoto = memo(function PlacedPhoto({ asset, placement, label, position, selected, animate, onFocus, onPointerDown, onResizeStart, onKeyDown }: PlacedPhotoProps) {
  const print = placement.look === "print";
  return (
    <div
      data-placed={asset.id}
      className={`absolute left-0 top-0 ${animate ? "transition-transform duration-300 ease-out motion-reduce:transition-none" : ""}`}
      style={{ width: placement.width, transform: placedTransform(placement) }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${label}, on the board, ${position}`}
        onFocus={() => onFocus(asset.id)}
        onPointerDown={(e) => onPointerDown(asset.id, e)}
        onKeyDown={(e) => onKeyDown(asset.id, e)}
        className={`relative touch-none select-none ${selected ? "outline outline-2 outline-offset-4 outline-vermilion-500" : "outline-none"} ${print ? "bg-white" : ""} shadow-[0_6px_16px_rgba(22,20,18,0.18)]`}
        style={print ? { padding: `${BORDER}px ${BORDER}px 0` } : undefined}
      >
        {asset.status === "ready" ? (
          <EditedPhoto src={asset.publicUrl} alt="" edit={asset.edit} dims={dimsOf(asset)} sizes="(min-width: 1024px) 380px, 50vw" blurDataUrl={asset.blurDataUrl} className="pointer-events-none" />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center bg-ink-900 text-xs text-paper-50">Processing…</div>
        )}
        {print ? (
          <p aria-hidden="true" className="truncate px-0.5 text-center text-[18px] leading-none text-ink-700" style={{ height: LABEL_HEIGHT, lineHeight: `${LABEL_HEIGHT}px`, fontFamily: "var(--font-caveat), cursive" }}>
            {label}
          </p>
        ) : null}
        {placement.tape ? <span aria-hidden="true" className="absolute -top-2.5 left-1/2 -ml-[35px] h-5 w-[70px] -rotate-[4deg] bg-[#E8D6AA]/75" /> : null}
      </div>
      {selected
        ? (Object.keys(CORNERS) as Corner[]).map((corner) => (
            <span
              key={corner}
              aria-hidden="true"
              data-corner={corner}
              onPointerDown={(e) => onResizeStart(asset.id, corner, e)}
              className={`absolute flex h-5 w-5 touch-none items-center justify-center ${CORNERS[corner]}`}
            >
              <span className="h-2.5 w-2.5 rounded-sm border-2 border-vermilion-500 bg-white" />
            </span>
          ))
        : null}
    </div>
  );
});
