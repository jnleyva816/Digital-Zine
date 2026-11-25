"use client";

import type { CSSProperties, DragEvent } from "react";
import { Ellipsis, Loader2, RotateCw } from "lucide-react";
import { EditedPhoto } from "@/components/EditedPhoto";
import { Windowed } from "@/components/Windowed";
import { DEFAULT_EDIT, frameLayout } from "@/lib/photo-edit";
import { cameraLine } from "./board-utils";
import { CoverPhoto } from "./PhotoCard";
import { ReorderHandle, type ReorderHandleProps } from "./ReorderHandle";
import type { BoardAsset } from "./types";

interface MobileCardProps extends ReorderHandleProps {
  asset: BoardAsset;
  layout: "grid" | "strip";
  /** The strip's photo box. */
  photo?: { width: number; height: number };
  /** False for a strip card too far off to draw. */
  near?: boolean;
  style?: CSSProperties;
  lifted: boolean;
  dropSide: "before" | "after" | null;
  /** With a mouse. On a touch screen the browser's own drag would take over the long press. */
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverSide: (after: boolean) => boolean;
  hasFoundRecipe: boolean;
  onMore: () => void;
  onRetryProcessing: () => void;
}

const round = "inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink-900/75 text-paper-50";

/** One photo on a phone's board (DIG-93). Its actions are in the ⋯ menu. */
export function MobileCard(props: MobileCardProps) {
  const { asset, label, index, layout, photo } = props;
  const strip = layout === "strip";
  const dims = asset.width && asset.height ? { width: asset.width, height: asset.height } : null;
  const recipe = asset.kind === "recipe" ? asset.recipe?.name : null;
  const camera = cameraLine(asset, strip ? "full" : "short");

  // The strip shows a photo's whole shape inside its box.
  const aspect = frameLayout(asset.edit ?? DEFAULT_EDIT, dims).aspect;
  const shape = photo ? { width: Math.min(photo.width, photo.height * aspect) } : undefined;

  const picture =
    asset.status === "processing" ? (
      <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-900 text-paper-50">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <span className="text-xs">
          Processing <span className="sr-only">{label}</span>…
        </span>
      </div>
    ) : asset.status === "failed" ? (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-900 px-3 pt-8 text-center text-paper-50">
        <p className="text-xs">{asset.processingError ?? "This photo could not be processed."}</p>
        <button type="button" onClick={props.onRetryProcessing} aria-label={`Retry processing ${label}`} className="relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-paper-50 px-4 text-xs font-semibold text-ink-900">
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </button>
      </div>
    ) : strip ? (
      <div data-flow={asset.id} className="overflow-hidden rounded" style={shape}>
        <EditedPhoto src={asset.publicUrl} alt={label} edit={asset.edit} dims={dims} sizes="(max-width: 640px) 80vw, 480px" blurDataUrl={asset.blurDataUrl} />
      </div>
    ) : (
      <CoverPhoto asset={asset} label={label} dims={dims} sizes="(max-width: 640px) 50vw, 25vw" />
    );

  const body = () => (
    <>
      <div
        {...(strip ? { style: { height: photo?.height } } : { "data-flow": asset.id, "data-testid": "photo-cover" })}
        className={`relative ${strip ? "flex items-center rounded" : "aspect-[4/5] overflow-hidden rounded-t-[11px] bg-ink-900"}`}
      >
        {picture}
        <ReorderHandle {...props} className="select-none [-webkit-touch-callout:none]" />
        {strip ? null : (
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-ink-900/80 px-[7px] py-[3px] font-mono text-[10.5px] leading-none text-paper-50">{String(index + 1).padStart(2, "0")}</span>
        )}
        <button type="button" aria-label={`More for ${label}`} aria-haspopup="dialog" onClick={props.onMore} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vermilion-500">
          <span className={round}>
            <Ellipsis className="h-4 w-4" aria-hidden="true" />
          </span>
        </button>
      </div>
      <div className={strip ? "flex flex-col gap-1.5 pt-2.5" : "flex flex-col gap-1 px-2.5 pb-2.5 pt-2"}>
        <p className={strip ? "truncate font-serif text-[19px] leading-tight" : "truncate text-[13px] font-semibold leading-tight text-ink-900"}>{label}</p>
        {recipe ? (
          <p className={`max-w-full self-start truncate rounded-full px-2 py-0.5 font-mono ${strip ? "bg-paper-50/[.12] text-[11px]" : "bg-[#F1E3D3] text-[10.5px] text-[#6B2A14]"}`}>{recipe}</p>
        ) : null}
        {strip || !recipe ? <p className={`truncate font-mono ${strip ? "text-[11px] text-[#CFC7BC]" : "text-[10.5px] text-ink-500"}`}>{camera}</p> : null}
        {props.hasFoundRecipe && !asset.recipe ? <p className={`text-xs ${strip ? "text-[#E8A08F]" : "text-vermilion-600"}`}>Recipe found in this photo</p> : null}
      </div>
    </>
  );

  return (
    <li
      data-asset-id={asset.id}
      data-lifted={props.lifted ? "" : undefined}
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
      className={`relative flex min-w-0 select-none flex-col [-webkit-touch-callout:none] ${strip ? "[scroll-snap-align:start]" : "rounded-xl border bg-paper-50"} ${
        props.held || props.lifted ? "z-10 border-vermilion-500 ring-2 ring-vermilion-500" : "border-paper-300"
      } ${props.lifted ? "opacity-60" : ""}`}
    >
      {props.dropSide ? (
        <span data-testid="drop-marker" data-side={props.dropSide} aria-hidden="true" className={`absolute inset-y-0 z-10 w-1 rounded-full bg-vermilion-500 ${props.dropSide === "before" ? "-left-2" : "-right-2"}`} />
      ) : null}
      {!strip ? <Windowed label={label}>{body()}</Windowed> : props.near ? body() : <span className="sr-only">{label}</span>}
    </li>
  );
}
