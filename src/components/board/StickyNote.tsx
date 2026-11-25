"use client";

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { NOTE_TEXT_MAX, type BoardNote } from "@/lib/board-layout";
import type { Corner } from "@/lib/freeform";
import { placedTransform, ResizeHandles } from "./PlacedPhoto";

/** A note's height before it has been measured, and its least height. */
export const noteMinHeight = (width: number) => Math.round(width * 0.8);

interface StickyNoteProps {
  note: BoardNote;
  position: string;
  selected: boolean;
  editing: boolean;
  animate: boolean;
  onFocus: (id: string) => void;
  onPointerDown: (id: string, e: React.PointerEvent<HTMLElement>) => void;
  onResizeStart: (id: string, corner: Corner, e: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (id: string, e: React.KeyboardEvent) => void;
  onEdit: (id: string) => void;
  onType: (id: string, text: string) => void;
  onFinish: (id: string) => void;
  onHeight: (id: string, height: number) => void;
}

/** One sticky note on the free-form board (DIG-89). For the creator only: never in a zine or a PDF. */
export const StickyNote = memo(function StickyNote({ note, position, selected, editing, animate, onFocus, onPointerDown, onResizeStart, onKeyDown, onEdit, onType, onFinish, onHeight }: StickyNoteProps) {
  const paper = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const refocus = useRef(false);
  const { id, width } = note;

  useLayoutEffect(() => {
    if (paper.current?.offsetHeight) onHeight(id, paper.current.offsetHeight);
  }, [id, width, note.text, onHeight]);

  useEffect(() => {
    if (editing) {
      const el = text.current;
      el?.focus({ preventScroll: true });
      el?.setSelectionRange(el.value.length, el.value.length);
    } else if (refocus.current) {
      refocus.current = false;
      paper.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  return (
    <div
      data-placed={id}
      className={`absolute left-0 top-0 ${animate ? "transition-transform duration-300 ease-out motion-reduce:transition-none" : ""}`}
      style={{ width, transform: placedTransform(note) }}
    >
      <div
        ref={paper}
        {...(editing
          ? { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() }
          : {
              role: "button",
              tabIndex: 0,
              "aria-pressed": selected,
              "aria-label": `Note: ${note.text}, on the board, ${position}`,
              onFocus: () => onFocus(id),
              onPointerDown: (e: React.PointerEvent<HTMLElement>) => onPointerDown(id, e),
              onKeyDown: (e: React.KeyboardEvent) => onKeyDown(id, e),
              onDoubleClick: () => onEdit(id),
            })}
        className={`relative bg-[#F6E7A8] p-3.5 text-2xl leading-[1.05] text-[#3D3730] shadow-[0_6px_16px_rgba(22,20,18,0.18)] ${editing ? "" : "touch-none select-none"} ${selected ? "outline outline-2 outline-offset-4 outline-vermilion-500" : "outline-none"}`}
        style={{ minHeight: noteMinHeight(width), fontFamily: "var(--font-caveat), cursive" }}
      >
        {/* While editing, this keeps the note as tall as what is written; a last empty line counts too. */}
        <p aria-hidden={editing} className={`whitespace-pre-wrap break-words ${editing ? "invisible" : ""}`}>
          {editing ? `${note.text}​` : note.text}
        </p>
        {editing ? (
          <textarea
            ref={text}
            aria-label="Note text"
            maxLength={NOTE_TEXT_MAX}
            value={note.text}
            onChange={(e) => onType(id, e.target.value)}
            onBlur={() => onFinish(id)}
            onKeyDown={(e) => {
              if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
              e.stopPropagation();
              refocus.current = true;
              onFinish(id);
            }}
            className="absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent p-3.5 text-2xl leading-[1.05] text-[#3D3730] outline-none"
            style={{ fontFamily: "inherit" }}
          />
        ) : null}
      </div>
      {selected && !editing ? <ResizeHandles id={id} onResizeStart={onResizeStart} /> : null}
    </div>
  );
});
