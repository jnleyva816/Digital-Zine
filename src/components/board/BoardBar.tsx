"use client";

import { useState } from "react";
import Link from "next/link";
import { GalleryHorizontal, LayoutGrid, Pencil, Shapes, Upload } from "lucide-react";
import type { BoardView } from "@/lib/board-layout";

const VIEWS = { free: { label: "Free form", icon: Shapes }, grid: { label: "Grid", icon: LayoutGrid }, strip: { label: "Strip", icon: GalleryHorizontal } } as const;
export type BuiltView = Extract<BoardView, keyof typeof VIEWS>;

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500";

interface BoardBarProps {
  boardId: string;
  name: string;
  total: number;
  view: BuiltView | null;
  views: BuiltView[];
  onView: (view: BuiltView) => void;
  /** Saves a new name; resolves to an error message, or null. */
  onRename: (name: string) => Promise<string | null>;
  onUpload: () => void;
}

/** The board's own bar (DIG-86): its name, the view switch, and what to do next. */
export function BoardBar({ boardId, name, total, view, views, onView, onRename, onUpload }: BoardBarProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = draft?.trim() ?? "";
    if (!next || next === name) {
      setDraft(null);
      setError(null);
      return;
    }
    const problem = await onRename(next);
    setError(problem);
    if (!problem) setDraft(null);
  }

  return (
    <div className="border-b border-paper-300 bg-paper-50">
      <div className="grid min-h-16 grid-cols-1 items-center gap-3 px-4 py-2.5 sm:px-6 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href="/boards" className={`shrink-0 rounded text-sm text-ink-500 hover:text-ink-900 ${focus}`}>
            Boards /
          </Link>
          {draft === null ? (
            <>
              <h1 className="truncate font-serif text-[22px] font-bold text-ink-900">{name}</h1>
              <button type="button" aria-label="Rename board" onClick={() => setDraft(name)} className={`shrink-0 rounded-full p-2 text-ink-500 hover:bg-paper-200 hover:text-ink-900 ${focus}`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          ) : (
            <form
              className="min-w-0"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <input
                autoFocus
                aria-label="Board name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void save()}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  setDraft(null);
                  setError(null);
                }}
                className="w-full min-w-0 rounded-lg border border-paper-300 bg-white px-2 py-1 font-serif text-xl font-bold text-ink-900 focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20"
              />
            </form>
          )}
          <span className="shrink-0 text-sm text-ink-500">
            {total.toLocaleString("en-US")} {total === 1 ? "photo" : "photos"}
          </span>
        </div>

        <div role="group" aria-label="Board view" className="flex gap-0.5 justify-self-start rounded-xl bg-paper-200 p-1 lg:justify-self-center">
          {views.map((v) => {
            const { label, icon: Icon } = VIEWS[v];
            return (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => onView(v)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm ${focus} ${view === v ? "bg-paper-50 font-semibold text-ink-900 shadow-sm" : "font-medium text-ink-700 hover:text-ink-900"}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 lg:justify-end">
          <button type="button" onClick={onUpload} className={`inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-paper-300 bg-white px-3.5 text-sm font-medium text-ink-900 hover:bg-paper-100 ${focus}`}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload
          </button>
          <Link href={`/editor?board=${encodeURIComponent(boardId)}`} className={`inline-flex min-h-10 items-center rounded-[10px] bg-ink-900 px-4 text-sm font-semibold text-paper-50 hover:bg-ink-800 ${focus}`}>
            Make a zine
          </Link>
        </div>
      </div>
      {error ? (
        <p role="alert" className="px-4 pb-2 text-sm text-red-800 sm:px-6">
          {error}
        </p>
      ) : null}
    </div>
  );
}
