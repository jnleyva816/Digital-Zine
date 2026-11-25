"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyRecipeText, recipeSettings, scalePosition, type Drawing, type FilmCardSetting } from "@/lib/film-card";
import type { ExifData, RecipeData } from "@/lib/types";

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

function Track({ at, min, max, color = "bg-vermilion-600" }: { at: number; min: number; max: number; color?: string }) {
  return (
    <div className="relative h-3">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-500/50" />
      {min < 0 && max > 0 ? <div className="absolute top-0 h-full w-px bg-ink-500" style={{ left: pct(scalePosition(0, min, max)) }} /> : null}
      <div
        className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${color}`}
        style={{ left: pct(scalePosition(at, min, max)) }}
      />
    </div>
  );
}

/** Decoration only: the value beside it is the text screen readers read. */
function Dial({ drawing }: { drawing: Drawing }) {
  return (
    <div aria-hidden="true" className="mt-1.5">
      {drawing.kind === "scale" ? <Track at={drawing.at} min={drawing.min} max={drawing.max} /> : null}
      {drawing.kind === "steps" ? (
        <div className="flex h-3 items-center gap-1">
          {Array.from({ length: drawing.count }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i === drawing.at ? "bg-vermilion-600" : "bg-ink-500/25"}`} />
          ))}
        </div>
      ) : null}
      {drawing.kind === "shift" ? (
        <>
          <Track at={drawing.red} min={-drawing.limit} max={drawing.limit} color="bg-red-700" />
          <Track at={drawing.blue} min={-drawing.limit} max={drawing.limit} color="bg-blue-700" />
        </>
      ) : null}
    </div>
  );
}

function Settings({ settings }: { settings: FilmCardSetting[] }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
      {settings.map(({ label, value, drawing }) => (
        <div key={label} className={drawing?.kind === "shift" ? "col-span-2" : undefined}>
          <dt className="font-mono text-[10px] uppercase tracking-wider text-ink-500">{label}</dt>
          <dd className="text-sm font-semibold text-ink-900">{value}</dd>
          {drawing ? <Dial drawing={drawing} /> : null}
        </div>
      ))}
    </dl>
  );
}

interface CardShellProps {
  kicker: string;
  title: string;
  subtitle?: string | null;
  settings: FilmCardSetting[];
  footer?: string | null;
}

/** The face both backs share (DIG-52): a headline, the settings as dials, and a footer. */
function CardShell({ kicker, title, subtitle, settings, footer }: CardShellProps) {
  return (
    <div className="mt-4 border-t-4 border-ink-900 pt-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-vermilion-600">{kicker}</p>
      <h3 className="mt-1 break-words font-serif text-2xl font-bold leading-tight text-ink-900 sm:text-3xl">{title}</h3>
      {subtitle ? <p className="mt-1 break-words text-sm text-ink-700">{subtitle}</p> : null}
      <Settings settings={settings} />
      {footer ? <p className="mt-4 border-t border-paper-300 pt-3 font-mono text-[11px] text-ink-700">{footer}</p> : null}
    </div>
  );
}

export function RecipeBack({ recipe, exif }: { recipe: RecipeData; exif: ExifData | null }) {
  const shotWith = exif
    ? [
        [exif.cameraMake, exif.cameraModel].filter(Boolean).join(" "),
        exif.iso ? `ISO ${exif.iso}` : null,
        exif.aperture,
        exif.shutterSpeed,
        exif.focalLength,
      ]
        .filter(Boolean)
        .join("  ·  ")
    : null;
  return (
    <CardShell kicker="Film recipe" title={recipe.filmSimulation} subtitle={recipe.name} settings={recipeSettings(recipe)} footer={shotWith} />
  );
}

/** Powers of two apart on a camera's dial, so a log scale puts each stop at an even distance. */
function stops(text: string | number | null | undefined, min: number, max: number): Drawing | null {
  const n = Number(/\d+(\.\d+)?/.exec(String(text ?? ""))?.[0]);
  return n > 0 ? { kind: "scale", min: Math.log2(min), max: Math.log2(max), at: Math.log2(n) } : null;
}

export function CameraBack({ exif }: { exif: ExifData | null }) {
  if (!exif) {
    return <p className="mt-5 rounded-xl border border-paper-300 bg-paper-50 p-4 text-sm text-ink-700">No embedded EXIF tags were recorded on this frame.</p>;
  }
  const settings: FilmCardSetting[] = [
    { label: "ISO", value: exif.iso ? `ISO ${exif.iso}` : "—", drawing: stops(exif.iso, 64, 12800) },
    { label: "Aperture", value: exif.aperture || "—", drawing: stops(exif.aperture, 1, 22) },
    { label: "Shutter speed", value: exif.shutterSpeed || "—", drawing: null },
    { label: "Focal length", value: exif.focalLength || "—", drawing: stops(exif.focalLength, 8, 600) },
  ];
  return (
    <CardShell
      kicker={exif.cameraMake || "Camera"}
      title={exif.cameraModel || "Camera settings"}
      subtitle={exif.lens}
      settings={settings}
      footer={exif.takenAt ? `Captured: ${exif.takenAt}` : null}
    />
  );
}

export function CopyRecipeButton({ recipe }: { recipe: RecipeData }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyRecipeText(recipe));
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 sm:bottom-4 sm:right-4">
      <span role="status" className={state === "idle" ? "sr-only" : "rounded-full bg-paper-50 px-3 py-1.5 text-xs text-ink-800 shadow"}>
        {state === "copied" ? "Recipe copied" : state === "failed" ? "Could not copy. Select the text instead." : ""}
      </span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink-900 px-4 text-sm font-semibold text-paper-50 shadow-md transition hover:bg-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500"
      >
        {state === "copied" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        Copy recipe
      </button>
    </div>
  );
}
