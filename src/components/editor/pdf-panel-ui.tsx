"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { PdfStyle } from "./usePdfStyle";

export function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section role="group" aria-labelledby={id} className="space-y-2.5">
      <h3 id={id} className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-700">
        {title}
      </h3>
      {children}
      {hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
    </section>
  );
}

/** A choice. The selected one differs by a heavier border as well as colour. */
export function Choice({ pressed, disabled, onClick, className = "", children }: { pressed: boolean; disabled?: boolean; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[44px] rounded-xl text-ink-900 transition focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500 disabled:opacity-40 ${
        pressed ? "bg-paper-100 shadow-[inset_0_0_0_2px_#161412]" : "bg-white shadow-[inset_0_0_0_1px_#DDD0B6] enabled:hover:bg-paper-100"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`flex min-h-[32px] items-center gap-2.5 text-sm ${disabled ? "text-ink-500" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-[18px] w-[18px] shrink-0 accent-ink-900" />
      {label}
    </label>
  );
}

export function Segment({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-[44px] flex-1 px-3 py-2 text-sm font-medium transition focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-vermilion-500 ${
        pressed ? "bg-ink-900 text-paper-50" : "bg-white text-ink-900 hover:bg-paper-100"
      }`}
    >
      {children}
    </button>
  );
}

export const segments = "flex overflow-hidden rounded-xl border border-paper-300";

/** A style that could not be saved, with another try. */
export function SaveError({ style }: { style: PdfStyle }) {
  if (!style.error) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs text-red-800">
      <span>{style.error}</span>
      <button type="button" onClick={() => void style.flush()} className="shrink-0 font-medium underline underline-offset-2">
        Try again
      </button>
    </div>
  );
}

export const savedMessage = ({ status }: PdfStyle) => (status === "saving" ? "Saving…" : status === "saved" ? "Style saved." : "");

/** The panel's two sides: choices with a footer that stays in view, and what they do. */
export function PanelLayout({ header, choices, footer, aside, asideLabel, onClose }: { header: ReactNode; choices: ReactNode; footer: ReactNode; aside: ReactNode; asideLabel: string; onClose: () => void }) {
  return (
    <div className="flex min-h-full flex-col lg:h-full lg:flex-row">
      <div className="flex shrink-0 flex-col bg-paper-50 lg:w-[440px] lg:border-r lg:border-paper-300">
        <div className="min-h-0 flex-1 space-y-6 px-5 py-6 sm:px-8 lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">{header}</div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-700 transition hover:bg-paper-200"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {choices}
        </div>
        <div className="sticky bottom-0 space-y-2 border-t border-paper-300 bg-paper-50 px-5 py-4 sm:px-8">{footer}</div>
      </div>
      <section aria-label={asideLabel} className="flex min-w-0 flex-1 lg:overflow-y-auto">
        <div className="m-auto min-w-0 max-w-full px-5 py-8">{aside}</div>
      </section>
    </div>
  );
}

export function UpgradePrompt({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-ink-500 ${className}`}>
      PDF export is a Pro feature.{" "}
      <Link href="/billing" className="font-medium text-vermilion-600 underline underline-offset-2">
        Upgrade to Pro
      </Link>
    </p>
  );
}
