"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Crop, FolderInput, Pencil, SlidersHorizontal, Trash2, X, type LucideIcon } from "lucide-react";
import { MovePhotoPanel } from "./MovePhotoPanel";
import { PhotoNameForm } from "./PhotoNameForm";
import type { BoardAsset } from "./types";

interface PhotoSheetProps {
  asset: BoardAsset;
  label: string;
  index: number;
  count: number;
  /** False while a filter hides part of the order. */
  canReorder: boolean;
  hasFoundRecipe: boolean;
  otherBoards: { id: string; name: string }[];
  usedIn: string[];
  deleting: boolean;
  onClose: () => void;
  onEditPhoto: () => void;
  onEditRecipe: () => void;
  onMoveBy: (delta: number) => void;
  onSaveName: (name: string | null) => Promise<string | null>;
  onMoveToBoard: (boardId: string) => Promise<string | null>;
  onDelete: () => Promise<void>;
}

/** A photo's ⋯ menu on a phone, with the panels its items open (DIG-93). */
export function PhotoSheet(props: PhotoSheetProps) {
  const { asset, label, onClose } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<"menu" | "rename" | "move" | "delete">("menu");

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Closed before it is removed, so focus goes back to the ⋯ button.
    return () => dialog?.close();
  }, []);

  const then = (action: () => void) => () => {
    onClose();
    action();
  };
  const unlessFailed = async (result: Promise<string | null>) => {
    const problem = await result;
    if (!problem) onClose();
    return problem;
  };

  let content: ReactNode;
  if (panel === "rename") {
    content = <PhotoNameForm fileName={asset.originalName} initialName={asset.name} onSave={(name) => unlessFailed(props.onSaveName(name))} onCancel={onClose} />;
  } else if (panel === "move") {
    content = <MovePhotoPanel label={label} boards={props.otherBoards} usedIn={props.usedIn} onMove={(id) => unlessFailed(props.onMoveToBoard(id))} onCancel={onClose} />;
  } else if (panel === "delete") {
    content = (
      <div className="stack-y-3">
        <p className="text-sm text-ink-700">Delete this photo? This cannot be undone.</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={props.deleting}
            aria-busy={props.deleting}
            onClick={() => void props.onDelete().then(onClose)}
            className="flex-1 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {props.deleting ? "Deleting…" : "Delete photo"}
          </button>
          <button type="button" autoFocus disabled={props.deleting} onClick={onClose} className="flex-1 rounded-xl border border-paper-300 bg-white px-4 text-sm font-semibold text-ink-900">
            Keep
          </button>
        </div>
      </div>
    );
  } else {
    const recipe = asset.recipe ? "Edit recipe" : props.hasFoundRecipe ? "Review recipe found in photo" : "Add recipe";
    content = (
      <div className="flex flex-col">
        {asset.status === "ready" ? <Item icon={Crop} onClick={then(props.onEditPhoto)}>Edit</Item> : null}
        <Item icon={SlidersHorizontal} onClick={then(props.onEditRecipe)}>{recipe}</Item>
        <Item icon={Pencil} onClick={() => setPanel("rename")}>Rename</Item>
        {props.otherBoards.length > 0 ? <Item icon={FolderInput} onClick={() => setPanel("move")}>Move to board</Item> : null}
        {props.canReorder ? (
          <>
            <Item icon={ArrowLeft} disabled={props.index === 0} onClick={then(() => props.onMoveBy(-1))}>Move earlier</Item>
            <Item icon={ArrowRight} disabled={props.index === props.count - 1} onClick={then(() => props.onMoveBy(1))}>Move later</Item>
          </>
        ) : null}
        <Item icon={Trash2} danger onClick={() => setPanel("delete")}>Delete</Item>
      </div>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      onCancel={(e) => {
        // Only the sheet's own cancel, not one bubbling from inside it.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="mx-auto mb-0 mt-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-paper-50 p-0 text-ink-900 backdrop:bg-ink-900/50"
    >
      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 [&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11 [&_input]:text-base [&_select]:min-h-11 [&_select]:text-base">
        <div className="flex items-center justify-between gap-3">
          <h2 className="truncate text-sm font-semibold">{label}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex items-center justify-center rounded-full text-ink-700 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-vermilion-500">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {content}
      </div>
    </dialog>
  );
}

function Item({ icon: Icon, children, onClick, disabled, danger }: { icon: LucideIcon; children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3 rounded-lg px-2 text-left text-[15px] hover:bg-paper-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-vermilion-500 disabled:opacity-40 ${danger ? "text-red-800" : "text-ink-900"}`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}
