"use client";

import { useState } from "react";
import Image from "next/image";
import { Camera, RotateCw, SlidersHorizontal } from "lucide-react";
import { recipeRows } from "@/lib/fuji-recipe";
import type { ExifData, RecipeData } from "@/lib/types";

export interface FlipCardProps {
  pageNumber: number;
  totalPages: number;
  imageUrl: string;
  caption?: string;
  flipEnabled: boolean;
  kind: "photo" | "recipe";
  exif: ExifData | null;
  recipe: RecipeData | null;
  priority?: boolean;
  defaultFlipped?: boolean;
}

export function FlipCard({
  pageNumber,
  totalPages,
  imageUrl,
  caption,
  flipEnabled,
  kind,
  exif,
  recipe,
  priority = false,
  defaultFlipped = false,
}: FlipCardProps) {
  const [flipped, setFlipped] = useState(flipEnabled ? defaultFlipped : false);

  const showRecipePrimary = kind === "recipe" && recipe !== null;
  const reverseBadgeLabel = showRecipePrimary ? "Film Recipe" : "Camera EXIF";
  const reverseName = showRecipePrimary ? "film recipe" : "camera details";
  const isFlipped = flipEnabled && flipped;

  const handleToggle = () => {
    if (!flipEnabled) return;
    setFlipped((prev) => !prev);
  };

  return (
    <article
      data-testid={`zine-flip-card-${pageNumber}`}
      data-flip-enabled={flipEnabled ? "true" : "false"}
      data-flipped={isFlipped ? "true" : "false"}
      className="w-full"
    >
      <div
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (!flipEnabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggle();
          }
        }}
        role={flipEnabled ? "button" : undefined}
        tabIndex={flipEnabled ? 0 : undefined}
        aria-label={flipEnabled ? `Page ${pageNumber}: flip to ${reverseName}` : undefined}
        aria-pressed={flipEnabled ? isFlipped : undefined}
        className={`flip-perspective relative aspect-[4/5] w-full select-none ${
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
            <Image
              src={imageUrl}
              alt={caption || `Page ${pageNumber} of ${totalPages}`}
              fill
              priority={priority}
              sizes="(max-width: 768px) 100vw, 680px"
              className="object-cover"
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 via-black/20 to-transparent p-4 sm:p-5">
              <span className="rounded-full bg-black/45 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-paper-50 backdrop-blur-sm">
                {String(pageNumber).padStart(2, "0")} /{" "}
                {String(totalPages).padStart(2, "0")}
              </span>

              {flipEnabled ? (
                <span
                  data-testid={`flip-trigger-${pageNumber}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-paper-50/95 px-3.5 py-1.5 text-xs font-semibold text-ink-900 shadow-md backdrop-blur"
                >
                  {showRecipePrimary ? (
                    <SlidersHorizontal className="h-3.5 w-3.5 text-vermilion-500" aria-hidden="true" />
                  ) : (
                    <Camera className="h-3.5 w-3.5 text-vermilion-500" aria-hidden="true" />
                  )}
                  Flip · {reverseBadgeLabel}
                  <RotateCw className="h-3 w-3 text-ink-500" aria-hidden="true" />
                </span>
              ) : null}
            </div>

            {caption ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-5 pb-5 pt-14 sm:px-7 sm:pb-6">
                <p className="font-serif text-base leading-relaxed text-paper-50 sm:text-lg">
                  {caption}
                </p>
              </div>
            ) : null}
          </div>

          {/* BACK FACE: Text and structured fields ONLY (EXIF or Recipe Card) */}
          {flipEnabled ? (
            <div
              aria-hidden={!isFlipped || undefined}
              className="flip-face flip-face-back flex flex-col justify-between overflow-y-auto rounded-2xl border border-paper-300 bg-paper-100 p-5 text-ink-900 sm:p-8">
              <div>
                <div className="flex items-center justify-between border-b border-paper-300 pb-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-[0.2em] text-vermilion-600">
                      Plate {String(pageNumber).padStart(2, "0")} · Reverse
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-paper-300 bg-paper-50 px-3 py-1 text-xs font-medium text-ink-700">
                    <RotateCw className="h-3 w-3" aria-hidden="true" />
                    Flip to Photo
                  </span>
                </div>

                {showRecipePrimary && recipe ? (
                  <div className="mt-5 space-y-4">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-500">
                        Fujifilm Film Recipe
                      </p>
                      <h3 className="mt-1 font-serif text-xl font-bold leading-snug text-ink-900 sm:text-2xl">
                        {recipe.name}
                      </h3>
                    </div>
                    <dl className="grid grid-cols-1 gap-x-5 gap-y-1.5 text-xs sm:grid-cols-2 sm:text-sm">
                      {recipeRows(recipe).map((row) => (
                        <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-paper-300/70 py-1">
                          <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-500">{row.label}</dt>
                          <dd className="text-right font-medium text-ink-900">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : (
                  <div className="mt-6 space-y-5">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-500">
                        Exposure & Optical Telemetry
                      </p>
                      <h3 className="mt-1 font-serif text-xl font-bold text-ink-900 sm:text-2xl">
                        {[exif?.cameraMake, exif?.cameraModel]
                          .filter(Boolean)
                          .join(" ") || "Camera Frame Metadata"}
                      </h3>
                      {exif?.lens ? (
                        <p className="mt-1 font-mono text-xs text-ink-700">
                          {exif.lens}
                        </p>
                      ) : null}
                    </div>

                    {exif ? (
                      <dl className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-paper-300 bg-paper-50 p-3.5">
                          <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-500">
                            ISO Sensitivity
                          </dt>
                          <dd className="mt-1 font-mono text-lg font-semibold text-ink-900">
                            {exif.iso ? `ISO ${exif.iso}` : "—"}
                          </dd>
                        </div>
                        <div className="rounded-xl border border-paper-300 bg-paper-50 p-3.5">
                          <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-500">
                            Aperture
                          </dt>
                          <dd className="mt-1 font-mono text-lg font-semibold text-ink-900">
                            {exif.aperture || "—"}
                          </dd>
                        </div>
                        <div className="rounded-xl border border-paper-300 bg-paper-50 p-3.5">
                          <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-500">
                            Shutter Speed
                          </dt>
                          <dd className="mt-1 font-mono text-lg font-semibold text-ink-900">
                            {exif.shutterSpeed || "—"}
                          </dd>
                        </div>
                        <div className="rounded-xl border border-paper-300 bg-paper-50 p-3.5">
                          <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-500">
                            Focal Length
                          </dt>
                          <dd className="mt-1 font-mono text-lg font-semibold text-ink-900">
                            {exif.focalLength || "—"}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="rounded-xl border border-paper-300 bg-paper-50 p-4 text-sm text-ink-700">
                        No embedded EXIF tags were recorded on this frame.
                      </p>
                    )}

                    {exif?.takenAt ? (
                      <p className="font-mono text-xs text-ink-500">
                        Captured: {exif.takenAt}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Compact secondary EXIF footer when the back shows a film recipe and the photo also has camera EXIF */}
              {showRecipePrimary && exif ? (
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-paper-300 pt-3 font-mono text-[11px] text-ink-500">
                  <span>
                    {[exif.cameraMake, exif.cameraModel]
                      .filter(Boolean)
                      .join(" ") || "Shot Specs"}
                  </span>
                  {exif.iso ? <span>ISO {exif.iso}</span> : null}
                  {exif.aperture ? <span>{exif.aperture}</span> : null}
                  {exif.shutterSpeed ? <span>{exif.shutterSpeed}</span> : null}
                  {exif.focalLength ? <span>{exif.focalLength}</span> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
