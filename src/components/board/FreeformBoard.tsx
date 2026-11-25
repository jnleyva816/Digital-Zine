"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Hand, Maximize, MousePointer2, PanelLeftOpen, StickyNote as NoteIcon } from "lucide-react";
import { prefersReducedMotion, transitionBoard } from "@/lib/board-transition";
import { MAX_BOARD_NOTES, type BoardNote, type Placement } from "@/lib/board-layout";
import { NUDGE, SIZE_STEP, bounds, clampWidth, fitView, nextTilt, resizeFrom, scatter, tidy, toBoard, zoomAt, type BoardViewport, type Corner, type Item } from "@/lib/freeform";
import { assetLabel } from "./board-utils";
import { PhotoTray } from "./PhotoTray";
import { PlacedPhoto, placedHeight, placedTransform } from "./PlacedPhoto";
import { StickyNote, noteMinHeight } from "./StickyNote";
import type { useBoardLayout } from "./useBoardLayout";
import { ACCEPTED_IMAGE_TYPES, type BoardAsset } from "./types";

/** A pointer that moves less than this has clicked, not dragged. */
const DRAG_SLOP = 4;
const NEW_WIDTH = 200;
const START: BoardViewport = { x: 0, y: 0, zoom: 1 };

/** One thing on the board: a photo, or a note (DIG-89). */
type Layer = { id: string; label: string; z: number } & (
  | { kind: "photo"; spot: Placement; asset: BoardAsset }
  | { kind: "note"; spot: BoardNote; asset?: undefined }
);

const noteLabel = (text: string) => `Note "${text.length > 40 ? `${text.slice(0, 40)}…` : text}"`;

type Drag =
  | { kind: "move" | "resize"; id: string; corner?: Corner; startX: number; startY: number; from: Item; el: HTMLElement; moved: boolean; next: { x: number; y: number; width: number } }
  | { kind: "pan"; startX: number; startY: number; from: BoardViewport }
  | { kind: "tray"; asset: BoardAsset; startX: number; startY: number; moved: boolean };

export interface FreeformBoardProps {
  boardId: string;
  assets: BoardAsset[];
  findAsset: (id: string) => BoardAsset | undefined;
  layout: ReturnType<typeof useBoardLayout>;
  trayRevision: string;
  /** The photo that must be on screen when the board opens. */
  startAt: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList) => void;
  /** A photo from the tray that the board may not have loaded yet. */
  onKnown: (asset: BoardAsset) => void;
  onEditPhoto: (id: string) => void;
  onEditRecipe: (id: string) => void;
  onAnnounce: (message: string) => void;
}

/** The free-form board (DIG-87): photos placed anywhere, over a tray to place them from (DIG-88). */
export function FreeformBoard({ boardId, assets, findAsset, layout, trayRevision, startAt, fileInputRef, onFiles, onKnown, onEditPhoto, onEditRecipe, onAnnounce }: FreeformBoardProps) {
  const { placements, notes, commit, addNote, typeNote, finishNote, deleteNote, saveProblem } = layout;
  const [view, setView] = useState<BoardViewport>(START);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  /** The note being written on, and how tall each note is. */
  const [editing, setEditing] = useState<string | null>(null);
  const [noteHeights, setNoteHeights] = useState<Record<string, number>>({});
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [space, setSpace] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [animate, setAnimate] = useState(false);
  const animateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [trayOpen, setTrayOpen] = useState(true);
  const [dropFiles, setDropFiles] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<BoardAsset | null>(null);
  const drag = useRef<Drag | null>(null);
  const pinch = useRef(new Map<number, { x: number; y: number }>());
  const fitted = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const toolRef = useRef(tool);
  toolRef.current = space ? "pan" : tool;

  // In stacking order, which is also Tab order. A photo that is gone is not drawn.
  const layers = useMemo(() => {
    const photos = placements.flatMap((spot): Layer[] => {
      const asset = findAsset(spot.assetId);
      return asset ? [{ kind: "photo", id: spot.assetId, label: assetLabel(asset, 0), z: spot.z, spot, asset }] : [];
    });
    const written = notes.map((spot): Layer => ({ kind: "note", id: spot.id, label: noteLabel(spot.text), z: spot.z, spot }));
    return [...photos, ...written].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
  }, [placements, notes, findAsset]);
  const items: Item[] = useMemo(
    () =>
      layers.map(({ id, spot, ...layer }) => ({
        id,
        x: spot.x,
        y: spot.y,
        width: spot.width,
        height: layer.kind === "photo" ? placedHeight(layer.asset, spot.width, (spot as Placement).look) : (noteHeights[id] ?? noteMinHeight(spot.width)),
        rotation: spot.rotation,
      })),
    [layers, noteHeights]
  );
  const placedIds = useMemo(() => new Set(placements.map((p) => p.assetId)), [placements]);
  const topZ = layers.at(-1)?.z ?? 0;
  const chosen = layers.find((l) => l.id === selected) ?? null;

  /** The latest values for the stable handlers below, so memoized items are not re-rendered by every change. */
  const now = useRef({ layers, items, onAnnounce, editing });
  now.current = { layers, items, onAnnounce, editing };
  const layerOf = (id: string) => now.current.layers.find((l) => l.id === id);

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The first look at the board shows everything on it.
  useLayoutEffect(() => {
    if (fitted.current || size.width === 0) return;
    fitted.current = true;
    const all = fitView(now.current.items, size);
    const item = now.current.items.find((i) => i.id === startAt);
    const x = item ? (item.x + item.width / 2) * all.zoom + all.x : size.width / 2;
    const y = item ? (item.y + item.height / 2) * all.zoom + all.y : size.height / 2;
    // A board too spread out to fit opens at the photo instead.
    if (x >= 0 && y >= 0 && x <= size.width && y <= size.height) setView(all);
    else setView({ ...all, x: all.x + size.width / 2 - x, y: all.y + size.height / 2 - y });
  }, [size, startAt]);

  // Trackpad and wheel: scroll pans, ctrl or cmd (and a trackpad pinch) zooms. Not passive, so the page stays put.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (e.ctrlKey || e.metaKey) setView((v) => zoomAt(v, at, v.zoom * Math.exp(-e.deltaY * 0.01)));
      else setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Holding Space pans, except while typing or on a control that Space presses.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as HTMLElement).closest?.("input, textarea, select, button, a, dialog")) return;
      e.preventDefault();
      setSpace(true);
    };
    const up = (e: KeyboardEvent) => e.key === " " && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const change = useCallback(
    (id: string, over: Partial<Placement>, said?: string) => {
      const layer = layerOf(id);
      if (!layer) return;
      if (layer.kind === "photo") commit([{ ...layer.spot, ...over }]);
      else {
        const { x, y, width, rotation, z } = { ...layer.spot, ...over };
        commit([], [], [{ id, x, y, width, rotation, z }]);
      }
      if (said) now.current.onAnnounce(`${layer.label} ${said}.`);
    },
    [commit]
  );

  /** Off the board: a photo stays in the tray, a note is deleted. */
  const takeOff = useCallback(
    (id: string) => {
      const layer = layerOf(id);
      if (!layer) return;
      if (layer.kind === "photo") commit([], [id]);
      else deleteNote(id);
      setSelected(null);
      now.current.onAnnounce(`${layer.label} ${layer.kind === "photo" ? "taken off the board" : "deleted"}.`);
    },
    [commit, deleteNote]
  );

  const resizeBy = useCallback(
    (id: string, by: number) => {
      const layer = layerOf(id);
      if (!layer) return;
      const width = clampWidth(layer.spot.width + by);
      change(id, { width }, width === layer.spot.width ? "is at its limit" : by > 0 ? "made larger" : "made smaller");
    },
    [change]
  );

  const editNote = useCallback((id: string) => {
    setSelected(id);
    setEditing(id);
  }, []);

  const endEdit = useCallback(
    (id: string) => {
      // Escape ends the edit, and then the field's own blur asks again.
      if (now.current.editing !== id) return;
      now.current.editing = null;
      setEditing(null);
      if (finishNote(id) === "removed") {
        setSelected(null);
        now.current.onAnnounce("Empty note removed.");
      }
    },
    [finishNote]
  );

  // Leaving the view, or turning a tablet, does not lose what was being written.
  useEffect(
    () => () => {
      if (now.current.editing) finishNote(now.current.editing);
    },
    [finishNote]
  );

  const onNoteHeight = useCallback((id: string, height: number) => setNoteHeights((prev) => (prev[id] === height ? prev : { ...prev, [id]: height })), []);

  const onItemKey = useCallback(
    (id: string, e: React.KeyboardEvent) => {
      const layer = layerOf(id);
      if (!layer || e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.shiftKey ? NUDGE.large : NUDGE.small;
      const { x, y } = layer.spot;
      const moves: Record<string, [Partial<Placement>, string]> = {
        ArrowLeft: [{ x: x - step }, "moved left"],
        ArrowRight: [{ x: x + step }, "moved right"],
        ArrowUp: [{ y: y - step }, "moved up"],
        ArrowDown: [{ y: y + step }, "moved down"],
      };
      if (moves[e.key]) change(id, ...moves[e.key]);
      else if (e.key === "[") resizeBy(id, -SIZE_STEP);
      else if (e.key === "]") resizeBy(id, SIZE_STEP);
      else if (e.key === "Delete" || e.key === "Backspace") takeOff(id);
      else if (e.key === "Escape") setSelected(null);
      else if (e.key === "Enter") {
        if (layer.kind === "note") editNote(id);
        else setSelected(id);
      }
      else return;
      e.preventDefault();
    },
    [change, resizeBy, takeOff, editNote]
  );

  // Selection follows focus, so Tab walks the photos; a press focuses too.
  const onItemFocus = useCallback((id: string) => setSelected(id), []);

  const startItemDrag = useCallback((kind: "move" | "resize", id: string, e: React.PointerEvent<HTMLElement>, corner?: Corner) => {
    if (e.button !== 0 || toolRef.current === "pan") return;
    const from = now.current.items.find((i) => i.id === id);
    const el = e.currentTarget.closest<HTMLElement>("[data-placed]");
    if (!from || !el) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { kind, id, corner, startX: e.clientX, startY: e.clientY, from, el, moved: false, next: from };
    setSelected(id);
  }, []);
  const onItemDown = useCallback((id: string, e: React.PointerEvent<HTMLElement>) => startItemDrag("move", id, e), [startItemDrag]);
  const onResizeStart = useCallback((id: string, corner: Corner, e: React.PointerEvent<HTMLElement>) => startItemDrag("resize", id, e, corner), [startItemDrag]);

  function onTrayDrag(asset: BoardAsset, e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { kind: "tray", asset, startX: e.clientX, startY: e.clientY, moved: false };
  }

  function onCanvasDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") {
      pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current.size === 2) {
        drag.current = null;
        return;
      }
    }
    if (e.button === 1 || toolRef.current === "pan" || e.pointerType === "touch") {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, from: viewRef.current };
      setDragging(true);
    }
    if (toolRef.current !== "pan" && e.button === 0) {
      setSelected(null);
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }

  function onMove(e: React.PointerEvent) {
    const last = pinch.current.get(e.pointerId);
    if (last && pinch.current.size === 2) {
      const other = [...pinch.current].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const rect = canvasRef.current!.getBoundingClientRect();
      const mid = { x: (e.clientX + other.x) / 2 - rect.left, y: (e.clientY + other.y) / 2 - rect.top };
      pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (before > 0) setView((v) => zoomAt(v, mid, (v.zoom * after) / before));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.kind === "pan") {
      setView({ ...d.from, x: d.from.x + dx, y: d.from.y + dy });
      return;
    }
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      d.moved = true;
      setDragging(true);
      if (d.kind === "tray") setGhost(d.asset);
      else d.el.style.zIndex = "1";
    }
    if (d.kind === "tray") {
      // The ghost mounts on the next render; until then there is nothing to move.
      requestAnimationFrame(() => {
        if (ghostRef.current) ghostRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%) rotate(-3deg)`;
      });
      return;
    }
    // Written straight to the element: React renders nothing until the drag ends.
    const zoom = viewRef.current.zoom;
    if (d.kind === "move") {
      d.next = { x: d.from.x + dx / zoom, y: d.from.y + dy / zoom, width: d.from.width };
      d.el.style.transform = placedTransform({ ...d.next, rotation: d.from.rotation }, true);
    } else {
      d.next = resizeFrom(d.from, d.corner!, dx / zoom);
      d.el.style.width = `${d.next.width}px`;
      d.el.style.transform = placedTransform({ ...d.next, rotation: d.from.rotation });
    }
  }

  const over = (el: HTMLElement | null, e: React.PointerEvent) => {
    const r = el?.getBoundingClientRect();
    return Boolean(r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
  };

  function onEnd(e: React.PointerEvent, cancelled = false) {
    pinch.current.delete(e.pointerId);
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    setGhost(null);
    if (!d || d.kind === "pan" || !d.moved) return;
    if (d.kind === "tray") {
      if (cancelled || !over(canvasRef.current, e)) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      place(d.asset, toBoard(viewRef.current, { x: e.clientX - rect.left, y: e.clientY - rect.top }));
      return;
    }
    d.el.style.zIndex = "";
    // Back to what React drew; a kept change re-renders to the new place at once.
    d.el.style.transform = placedTransform(d.from);
    d.el.style.width = `${d.from.width}px`;
    if (cancelled) return;
    if (d.kind === "move" && over(trayRef.current, e)) {
      // A note has no place in the tray, so it goes back to where it was.
      if (placedIds.has(d.id)) takeOff(d.id);
      return;
    }
    const round = (n: number) => Math.round(n * 10) / 10;
    const next = { x: round(d.next.x), y: round(d.next.y), width: d.next.width };
    d.el.style.transform = placedTransform({ ...next, rotation: d.from.rotation });
    d.el.style.width = `${next.width}px`;
    change(d.id, next);
  }

  function place(asset: BoardAsset, centre: { x: number; y: number }) {
    onKnown(asset);
    const height = placedHeight(asset, NEW_WIDTH, "print");
    commit([
      {
        assetId: asset.id,
        x: Math.round(centre.x - NEW_WIDTH / 2),
        y: Math.round(centre.y - height / 2),
        width: NEW_WIDTH,
        rotation: Math.round((Math.random() - 0.5) * 10),
        z: topZ + 1,
        look: "print",
        tape: Math.random() < 0.25,
      },
    ]);
    setSelected(asset.id);
    onAnnounce(`${assetLabel(asset, 0)} placed on the board.`);
  }

  function writeNote() {
    const centre = toBoard(view, middle);
    editNote(
      addNote({
        x: Math.round(centre.x - NEW_WIDTH / 2),
        y: Math.round(centre.y - noteMinHeight(NEW_WIDTH) / 2),
        width: NEW_WIDTH,
        rotation: Math.round((Math.random() - 0.5) * 6),
        z: topZ + 1,
      })
    );
  }

  const middle = { x: size.width / 2, y: size.height / 2 };

  function find(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setSelected(id);
    setView((v) => ({ ...v, x: middle.x - (item.x + item.width / 2) * v.zoom, y: middle.y - (item.y + item.height / 2) * v.zoom }));
  }

  function arrange(moves: ReturnType<typeof tidy>, said: string) {
    if (moves.length === 0) return;
    const to = new Map(moves.map(({ id, ...m }) => [id, m]));
    const move = () =>
      commit(
        layers.flatMap((l) => (l.kind === "photo" ? [{ ...l.spot, ...to.get(l.id) }] : [])),
        [],
        layers.flatMap((l) => (l.kind === "note" ? [{ id: l.id, width: l.spot.width, z: l.z, x: l.spot.x, y: l.spot.y, rotation: l.spot.rotation, ...to.get(l.id) }] : []))
      );
    // CSS moves them, so any number can move and the board still takes the pointer; only the cross-fade needs the browser's pictures.
    if (prefersReducedMotion()) transitionBoard({ order: [], update: move });
    else {
      clearTimeout(animateTimer.current);
      setAnimate(true);
      animateTimer.current = setTimeout(() => setAnimate(false), 350);
      move();
    }
    onAnnounce(said);
  }

  const chosenItem = chosen ? items.find((i) => i.id === chosen.id)! : null;
  const panning = space || tool === "pan";
  const toolButton = "inline-flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[13px] text-ink-900 hover:bg-paper-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-vermilion-500 disabled:opacity-40";
  const barButton = "min-h-9 rounded-lg px-2.5 text-xs text-paper-50 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-paper-50";
  const filesIn = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      className="flex h-[calc(100dvh-7.6rem)] min-h-[420px]"
      onPointerMove={onMove}
      onPointerUp={(e) => onEnd(e)}
      onPointerCancel={(e) => onEnd(e, true)}
      onDragOver={(e) => {
        if (!filesIn(e)) return;
        e.preventDefault();
        setDropFiles(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropFiles(false);
      }}
      onDrop={(e) => {
        if (!filesIn(e)) return;
        e.preventDefault();
        setDropFiles(false);
        // To the tray, never straight onto the board (owner, 19 Nov).
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
    >
      {/* What the bar's Upload opens, with the tray open or hidden. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {trayOpen ? (
        <PhotoTray
          boardId={boardId}
          trayRef={trayRef}
          initial={assets}
          latest={(asset) => findAsset(asset.id) ?? asset}
          isPlaced={(id) => placedIds.has(id)}
          revision={trayRevision}
          onFiles={onFiles}
          onPlace={(asset) => place(asset, toBoard(view, middle))}
          onFind={find}
          onDragStart={onTrayDrag}
          onHide={() => setTrayOpen(false)}
        />
      ) : null}

      <section
        ref={canvasRef}
        aria-label="Free form board"
        onPointerDown={onCanvasDown}
        className={`relative min-w-0 flex-1 touch-none overflow-hidden bg-[#F4F0E8] ${panning ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""} ${dropFiles ? "ring-4 ring-inset ring-vermilion-500/50" : ""}`}
        style={{
          backgroundImage: "radial-gradient(circle, #D9CFBE 1.1px, transparent 1.2px)",
          backgroundSize: `${22 * view.zoom}px ${22 * view.zoom}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div ref={worldRef} className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {layers.map((layer, i) => {
            const shared = {
              position: `${i + 1} of ${layers.length}`,
              selected: selected === layer.id,
              animate,
              onFocus: onItemFocus,
              onPointerDown: onItemDown,
              onResizeStart,
              onKeyDown: onItemKey,
            };
            return layer.kind === "photo" ? (
              <PlacedPhoto key={layer.id} asset={layer.asset} placement={layer.spot} label={layer.label} {...shared} />
            ) : (
              <StickyNote key={layer.id} note={layer.spot} editing={editing === layer.id} onEdit={editNote} onType={typeNote} onFinish={endEdit} onHeight={onNoteHeight} {...shared} />
            );
          })}
        </div>

        {layers.length === 0 ? (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm text-ink-500">
            Nothing placed yet. Drag photos here from the tray, or focus one and press Enter.
          </p>
        ) : null}

        {!trayOpen ? (
          <button type="button" aria-label="Show photo tray" onPointerDown={(e) => e.stopPropagation()} onClick={() => setTrayOpen(true)} className="absolute left-3 top-3 rounded-xl border border-paper-300 bg-paper-50 p-2.5 text-ink-900 shadow-sm hover:bg-paper-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-vermilion-500">
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}

        {chosen && chosenItem && !dragging && !editing ? (
          <div
            role="toolbar"
            aria-label={chosen.kind === "photo" ? "Selected photo" : "Selected note"}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-0.5 rounded-xl bg-ink-900 p-1 shadow-lg"
            style={{
              left: Math.min(Math.max((chosenItem.x + chosenItem.width / 2) * view.zoom + view.x, 250), Math.max(250, size.width - 250)),
              top: Math.min(Math.max(chosenItem.y * view.zoom + view.y - 62, 8), Math.max(8, size.height - 130)),
            }}
          >
            <span className="max-w-32 truncate px-2 text-xs text-paper-200">{chosen.label}</span>
            {chosen.kind === "photo" ? (
              <>
                <button type="button" className={barButton} onClick={() => onEditPhoto(chosen.id)}>Edit</button>
                <button type="button" className={barButton} onClick={() => onEditRecipe(chosen.id)}>Recipe</button>
              </>
            ) : (
              <button type="button" className={barButton} onClick={() => editNote(chosen.id)}>Edit</button>
            )}
            <button type="button" aria-label="Smaller" className={barButton} onClick={() => resizeBy(chosen.id, -SIZE_STEP)}>−</button>
            <button type="button" aria-label="Larger" className={barButton} onClick={() => resizeBy(chosen.id, SIZE_STEP)}>+</button>
            <button type="button" className={barButton} onClick={() => change(chosen.id, { rotation: nextTilt(chosen.spot.rotation) }, "tilted")}>Tilt</button>
            <button type="button" className={barButton} onClick={() => change(chosen.id, { z: topZ + 1 }, "brought to front")}>To front</button>
            {chosen.kind === "photo" ? (
              <button type="button" className={barButton} onClick={() => change(chosen.id, { look: chosen.spot.look === "print" ? "plain" : "print" }, "border changed")}>
                {chosen.spot.look === "print" ? "Plain" : "Print"}
              </button>
            ) : null}
            <button type="button" className={`${barButton} !text-[#F6A48A]`} onClick={() => takeOff(chosen.id)}>{chosen.kind === "photo" ? "Take off board" : "Delete note"}</button>
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-4 flex justify-center px-4" style={{ pointerEvents: "none" }}>
          <div role="toolbar" aria-label="Board tools" onPointerDown={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-0.5 rounded-2xl border border-paper-300 bg-paper-50 p-1 shadow-lg" style={{ pointerEvents: "auto" }}>
            <button type="button" aria-pressed={tool === "select"} onClick={() => setTool("select")} className={`${toolButton} ${tool === "select" ? "bg-paper-200" : ""}`}><MousePointer2 className="h-4 w-4" aria-hidden="true" />Select</button>
            <button type="button" aria-pressed={tool === "pan"} onClick={() => setTool("pan")} className={`${toolButton} ${tool === "pan" ? "bg-paper-200" : ""}`}><Hand className="h-4 w-4" aria-hidden="true" />Pan</button>
            <button type="button" disabled={notes.length >= MAX_BOARD_NOTES} title={notes.length >= MAX_BOARD_NOTES ? `A board can hold ${MAX_BOARD_NOTES} notes.` : undefined} onClick={writeNote} className={toolButton}><NoteIcon className="h-4 w-4" aria-hidden="true" />Note</button>
            <button type="button" aria-label="Zoom out" onClick={() => setView((v) => zoomAt(v, middle, Math.round((v.zoom - 0.1) * 10) / 10))} className={toolButton}>−</button>
            <span data-testid="board-zoom" className="min-w-11 text-center font-mono text-xs text-ink-700">{Math.round(view.zoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" onClick={() => setView((v) => zoomAt(v, middle, Math.round((v.zoom + 0.1) * 10) / 10))} className={toolButton}>+</button>
            <button type="button" onClick={() => setView(fitView(items, size))} className={toolButton}><Maximize className="h-4 w-4" aria-hidden="true" />Fit</button>
            <button type="button" disabled={layers.length === 0} onClick={() => arrange(tidy(items), "Board tidied into a grid.")} className={toolButton}>Tidy up</button>
            <button type="button" disabled={layers.length === 0} onClick={() => arrange(scatter(items, Math.random), "Board scattered.")} className={toolButton}>Scatter</button>
          </div>
        </div>

        {saveProblem ? (
          <p role="status" onPointerDown={(e) => e.stopPropagation()} className="absolute right-4 top-4 rounded-xl border border-paper-300 bg-paper-50 px-3.5 py-2 text-sm text-ink-800 shadow">
            {saveProblem}{" "}
            <button type="button" onClick={() => void layout.retry()} className="font-semibold text-vermilion-600 underline underline-offset-2">Retry</button>
          </p>
        ) : null}

        <MiniMap items={items} view={view} size={size} onJump={(x, y) => setView((v) => ({ ...v, x: middle.x - x * v.zoom, y: middle.y - y * v.zoom }))} />
      </section>

      {ghost ? (
        <div ref={ghostRef} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-50 w-32 -translate-x-full bg-white p-1.5 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ghost.publicUrl.replace(/\/full\.avif$/, "/w480.avif")} alt="" onError={(e) => (e.currentTarget.src = ghost.publicUrl)} className="aspect-[4/5] w-full object-cover" />
        </div>
      ) : null}
    </div>
  );
}

const MAP = { width: 150, height: 100 };

/** Where everything is, and the part on screen. A pointer shortcut: Fit and the tray reach the same places. */
function MiniMap({ items, view, size, onJump }: { items: Item[]; view: BoardViewport; size: { width: number; height: number }; onJump: (x: number, y: number) => void }) {
  if (items.length === 0 || size.width === 0) return null;
  const seen: Item = { id: "", ...toBoard(view, { x: 0, y: 0 }), width: size.width / view.zoom, height: size.height / view.zoom, rotation: 0 };
  const box = bounds([...items, seen])!;
  const scale = Math.min(MAP.width / (box.right - box.left), MAP.height / (box.bottom - box.top));
  const rect = (i: Item) => ({ left: (i.x - box.left) * scale, top: (i.y - box.top) * scale, width: i.width * scale, height: i.height * scale });
  return (
    <div
      aria-hidden="true"
      data-testid="board-minimap"
      onPointerDown={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        onJump((e.clientX - r.left) / scale + box.left, (e.clientY - r.top) / scale + box.top);
      }}
      className="absolute bottom-20 right-4 cursor-pointer overflow-hidden rounded-lg border border-paper-300 bg-paper-50/90 shadow"
      style={MAP}
    >
      {items.map((i) => (
        <span key={i.id} className="absolute bg-ink-500/60" style={rect(i)} />
      ))}
      <span className="absolute border-2 border-vermilion-500" style={rect(seen)} />
    </div>
  );
}
