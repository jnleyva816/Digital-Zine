"use client";

import { useRef, useState } from "react";
import { EditedPhoto } from "@/components/EditedPhoto";
import { DEFAULT_EDIT, frameLayout, type PhotoEdit } from "@/lib/photo-edit";
import { Camera, Maximize2, RotateCw, SlidersHorizontal } from "lucide-react";
import { CameraBack, CopyRecipeButton, RecipeBack } from "@/components/FilmCard";
import { shotOnLabel } from "@/lib/film-card";
import type { ExifData, RecipeData } from "@/lib/types";

export interface FlipCardProps {
  pageNumber: number;
  totalPages: number;
  imageUrl: string;
  /** The creator's name for the photo (DIG-34): its description and the title on the back. */
  name?: string | null;
  /** Crop and frame (DIG-33); null shows the photo as an unedited 4:5 page. */
  edit?: PhotoEdit | null;
  dims?: { width: number; height: number } | null;
  /** Tiny inline image shown while the photo loads (DIG-26). */
  blurDataUrl?: string | null;
  caption?: string;
  flipEnabled: boolean;
  kind: "photo" | "recipe";
  exif: ExifData | null;
  recipe: RecipeData | null;
  priority?: boolean;
  defaultFlipped?: boolean;
  /** Shows a button that opens the photo full screen (DIG-49); called with this card's element. */
  onOpenFullScreen?: (card: HTMLElement) => void;
}

export function FlipCard({
  pageNumber,
  totalPages,
  imageUrl,
  name,
  edit = null,
  dims = null,
  blurDataUrl,
  caption,
  flipEnabled,
  kind,
  exif,
  recipe,
  priority = false,
  defaultFlipped = false,
  onOpenFullScreen,
}: FlipCardProps) {
  const articleRef = useRef<HTMLElement>(null);
  const [flipped, setFlipped] = useState(flipEnabled ? defaultFlipped : false);

  const showRecipePrimary = kind === "recipe" && recipe !== null;
  const chip = shotOnLabel(exif, recipe) ?? (showRecipePrimary ? "Film recipe" : "Camera details");
  const reverseName = showRecipePrimary ? "film recipe" : "camera details";
  const isFlipped = flipEnabled && flipped;
  const aspect = frameLayout(edit ?? DEFAULT_EDIT, dims).aspect;

  const handleToggle = () => {
    if (!flipEnabled) return;
    setFlipped((prev) => !prev);
  };

  return (
    <article
      ref={articleRef}
      data-testid={`zine-flip-card-${pageNumber}`}
      data-flip-enabled={flipEnabled ? "true" : "false"}
      data-flipped={isFlipped ? "true" : "false"}
      className="relative w-full"
    >
      <div
        onClick={handleToggle}
        style={{ aspectRatio: String(Math.round(aspect * 10000) / 10000) }}
        className={`flip-perspective relative w-full select-none ${
          flipEnabled ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div
          className={`flip-inner rounded-2xl shadow-xl ring-1 ring-ink-900/10 ${
            isFlipped ? "is-flipped" : ""
          }`}
        >
          {/* FRONT FACE: Full-bleed photo page with optional caption */}
          <div className="flip-face overflow-hidden rounded-2xl bg-ink-900" aria-hidden={isFlipped || undefined}>
            <EditedPhoto
              src={imageUrl}
              alt={name || caption || `Page ${pageNumber} of ${totalPages}`}
              edit={edit}
              dims={dims}
              priority={priority}
              sizes="(max-width: 768px) 100vw, 680px"
              blurDataUrl={blurDataUrl}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 via-black/20 to-transparent p-4 sm:p-5">
              <span className="rounded-full bg-black/45 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-paper-50 backdrop-blur-sm">
                {String(pageNumber).padStart(2, "0")} /{" "}
                {String(totalPages).padStart(2, "0")}
              </span>
            </div>

            {caption ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-5 pb-5 pt-14 sm:px-7 sm:pb-6">
                <p className={`font-serif text-base leading-relaxed text-paper-50 sm:text-lg ${onOpenFullScreen ? "mr-12" : ""}`}>
                  {caption}
                </p>
              </div>
            ) : null}
          </div>

          {/* BACK FACE: Text and structured fields ONLY (EXIF or Recipe Card) */}
          {flipEnabled ? (
            <div
              aria-hidden={!isFlipped || undefined}
              className={`flip-face flip-face-back overflow-y-auto rounded-2xl border border-paper-300 bg-paper-100 p-5 text-ink-900 sm:p-8 ${showRecipePrimary ? "pb-20 sm:pb-20" : ""}`}
            >
              <p className="flex min-h-8 items-center pr-28 font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
                Plate {String(pageNumber).padStart(2, "0")}
              </p>
              {name ? <h2 className="mt-3 break-words font-serif text-xl font-bold text-ink-900">{name}</h2> : null}
              {showRecipePrimary && recipe ? <RecipeBack recipe={recipe} exif={exif} /> : <CameraBack exif={exif} />}
            </div>
          ) : null}
        </div>
      </div>

      {/*
        The flip control is a button of its own rather than the whole card (DIG-52): screen readers flatten
        whatever is inside a button, which would hide the settings on the back. Clicking the card flips it too.
      */}
      {flipEnabled ? (
        <button
          type="button"
          data-testid={`flip-trigger-${pageNumber}`}
          aria-label={`Page ${pageNumber}: flip to ${reverseName}, ${chip}`}
          aria-pressed={isFlipped}
          onClick={handleToggle}
          className="absolute right-3 top-3 z-10 inline-flex min-h-9 max-w-[70%] items-center gap-1.5 rounded-full bg-paper-50/95 px-3.5 py-1.5 text-xs font-semibold text-ink-900 shadow-md ring-1 ring-ink-900/10 backdrop-blur transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500 sm:right-4 sm:top-4"
        >
          {isFlipped ? null : showRecipePrimary ? (
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-vermilion-600" aria-hidden="true" />
          ) : (
            <Camera className="h-3.5 w-3.5 shrink-0 text-vermilion-600" aria-hidden="true" />
          )}
          <span className="truncate">{isFlipped ? "Photo" : chip}</span>
          <RotateCw className="h-3 w-3 shrink-0 text-ink-500" aria-hidden="true" />
        </button>
      ) : null}
      {isFlipped && showRecipePrimary && recipe ? <CopyRecipeButton recipe={recipe} /> : null}

      {/* Beside the card, so pressing this does not flip it. */}
      {onOpenFullScreen && !isFlipped ? (
        <button
          type="button"
          data-page-expand={pageNumber}
          aria-label={`View page ${pageNumber} full screen`}
          onClick={() => articleRef.current && onOpenFullScreen(articleRef.current)}
          className="absolute bottom-3 right-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-paper-50 shadow-md backdrop-blur-sm transition hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500 sm:bottom-4 sm:right-4"
        >
          <Maximize2 className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}
