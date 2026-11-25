"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardNote, NoteSpot, Placement } from "@/lib/board-layout";
import { readApiError } from "./types";

type NewNote = Omit<BoardNote, "id" | "text">;
interface Job {
  key: string;
  /** Null once saved, or why it was not. */
  run: () => Promise<string | null>;
}

const spotOf = ({ x, y, width, rotation, z }: BoardNote) => ({ x, y, width, rotation, z });

/**
 * A board's free-form layout (DIG-87) and its sticky notes (DIG-89): what is where, and saving it.
 * Changes show at once and are saved in the background, one request at a time, so an older position
 * can never land after a newer one. A failed save keeps the local copy and can be retried, unless it
 * can never succeed because something in it is gone: then the saved layout is loaded again.
 *
 * A note has its own local id from the moment it is added, so nothing about it changes on screen when
 * the server creates it; `serverIds` says which saved note it is.
 */
export function useBoardLayout(boardId: string, initialPlacements: Placement[], initialNotes: BoardNote[], onReload: () => void) {
  const [placements, setPlacements] = useState<Placement[]>(initialPlacements);
  const [notes, setNotes] = useState<BoardNote[]>(initialNotes);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  /** Goes up after each saved layout, for anything that reads the server's copy. */
  const [savedCount, setSavedCount] = useState(0);
  const current = useRef({ placements, notes });
  const saving = useRef(false);
  const reloaded = useRef(onReload);
  reloaded.current = onReload;

  // What is still to be saved. Placements by value, null for taken off; notes by local id.
  const pending = useRef(new Map<string, Placement | null>());
  const spots = useRef(new Set<string>());
  const creates = useRef(new Set<string>());
  const texts = useRef(new Set<string>());
  const deletes = useRef(new Set<string>());
  const typing = useRef(new Set<string>());
  const creating = useRef<string | null>(null);
  const serverIds = useRef<Map<string, string>>(undefined);
  serverIds.current ??= new Map(initialNotes.map((n) => [n.id, n.id]));
  const savedText = useRef<Map<string, string>>(undefined);
  savedText.current ??= new Map(initialNotes.map((n) => [n.id, n.text]));

  const show = useCallback((next: Placement[]) => {
    current.current.placements = next;
    setPlacements(next);
  }, []);
  const showNotes = useCallback((next: BoardNote[]) => {
    current.current.notes = next;
    setNotes(next);
  }, []);

  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    const base = `/api/boards/${encodeURIComponent(boardId)}`;
    const ids = serverIds.current!;
    const send = (method: string, path: string, body?: unknown) =>
      fetch(base + path, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    const noteOf = (id: string) => current.current.notes.find((n) => n.id === id);
    const notePath = (id: string) => `/notes/${encodeURIComponent(ids.get(id)!)}`;

    /** Takes the server's notes, and its placements too if ours cannot be saved. */
    async function reload(placementsToo: boolean): Promise<string | null> {
      const res = await fetch(`${base}/layout`, { cache: "no-store" });
      if (!res.ok) return "Couldn't save layout.";
      const layout = (await res.json()) as { placements: Placement[]; notes: BoardNote[] };
      const local = new Map([...ids].map(([mine, theirs]) => [theirs, mine]));
      const fresh = layout.notes.map((n) => {
        const id = local.get(n.id) ?? n.id;
        ids.set(id, n.id);
        savedText.current!.set(id, n.text);
        const mine = texts.current.has(id) || typing.current.has(id) ? noteOf(id)?.text : undefined;
        return { ...n, id, text: mine ?? n.text };
      });
      const kept = new Set(fresh.map((n) => n.id));
      for (const set of [texts, deletes, typing, spots]) for (const id of set.current) if (ids.has(id) && !kept.has(id)) set.current.delete(id);
      if (placementsToo) {
        pending.current.clear();
        spots.current.clear();
        show(layout.placements);
      }
      const unsaved = current.current.notes.filter((n) => !ids.has(n.id));
      const known = new Map(current.current.notes.map((n) => [n.id, n]));
      // A note that has moved since keeps its newer place; it is still to be saved.
      const placed = fresh.map((n) => (spots.current.has(n.id) && known.has(n.id) ? { ...n, ...spotOf(known.get(n.id)!) } : n));
      showNotes([...placed.filter((n) => !deletes.current.has(n.id)), ...unsaved]);
      reloaded.current();
      return null;
    }

    function next(stuck: Set<string>): Job | null {
      for (const id of deletes.current) {
        if (!ids.has(id) || stuck.has(`delete ${id}`)) continue;
        return {
          key: `delete ${id}`,
          run: async () => {
            const res = await send("DELETE", notePath(id));
            // Already gone is what was asked for.
            if (!res.ok && res.status !== 404) return readApiError(res, "Couldn't delete the note.");
            deletes.current.delete(id);
            return null;
          },
        };
      }
      for (const id of creates.current) {
        const note = noteOf(id);
        if (!note || typing.current.has(id) || stuck.has(`create ${id}`)) continue;
        return {
          key: `create ${id}`,
          run: async () => {
            creating.current = id;
            creates.current.delete(id);
            spots.current.delete(id);
            let problem: string | null = "Couldn't save the note.";
            try {
              const res = await send("POST", "/notes", { text: note.text, ...spotOf(note) });
              if (res.ok) {
                ids.set(id, ((await res.json()) as { note: { id: string } }).note.id);
                savedText.current!.set(id, note.text);
                problem = null;
              } else problem = await readApiError(res, problem);
            } finally {
              creating.current = null;
              if (!ids.has(id)) {
                deletes.current.delete(id);
                if (noteOf(id)) creates.current.add(id);
              }
            }
            return problem;
          },
        };
      }
      for (const id of texts.current) {
        const note = noteOf(id);
        if (!note || !ids.has(id) || typing.current.has(id) || stuck.has(`text ${id}`)) continue;
        return {
          key: `text ${id}`,
          run: async () => {
            const res = await send("PATCH", notePath(id), { text: note.text });
            if (res.status === 404) return reload(false);
            if (!res.ok) return readApiError(res, "Couldn't save the note.");
            savedText.current!.set(id, note.text);
            if (noteOf(id)?.text === note.text) texts.current.delete(id);
            return null;
          },
        };
      }
      const moved = current.current.notes.filter((n) => spots.current.has(n.id) && ids.has(n.id));
      if ((pending.current.size === 0 && moved.length === 0) || stuck.has("layout")) return null;
      return {
        key: "layout",
        run: async () => {
          const batch = new Map(pending.current);
          for (const n of moved) spots.current.delete(n.id);
          let ok = false;
          try {
            const res = await send("PUT", "/layout", {
              placements: [...batch.values()].filter((p) => p !== null),
              removed: [...batch].filter(([, p]) => p === null).map(([id]) => id),
              ...(moved.length > 0 ? { notes: moved.map((n): NoteSpot => ({ id: ids.get(n.id)!, ...spotOf(n) })) } : {}),
            });
            if (res.status === 404) {
              const problem = await reload(true);
              ok = problem === null;
              return problem;
            }
            ok = res.ok;
            if (!ok) return "Couldn't save layout.";
            for (const [id, p] of batch) if (pending.current.get(id) === p) pending.current.delete(id);
            setSavedCount((n) => n + 1);
            return null;
          } finally {
            if (!ok) for (const n of moved) spots.current.add(n.id);
          }
        },
      };
    }

    // One failure does not hold up the rest; it waits for Retry, or the next change.
    const stuck = new Set<string>();
    let problem: string | null = null;
    for (let job = next(stuck); job; job = next(stuck)) {
      const failed = await job.run().catch(() => (job!.key === "layout" ? "Couldn't save layout." : "Couldn't save the note."));
      if (failed === null) continue;
      stuck.add(job.key);
      problem = failed;
    }
    saving.current = false;
    setSaveProblem(problem);
  }, [boardId, show, showNotes]);

  /** Applies and saves changes, and takes photos off the board. */
  const commit = useCallback(
    (changed: Placement[], removed: string[] = [], movedNotes: NoteSpot[] = []) => {
      if (changed.length > 0 || removed.length > 0) {
        const gone = new Set(removed);
        const byId = new Map(changed.map((p) => [p.assetId, p]));
        const kept = current.current.placements.filter((p) => !gone.has(p.assetId)).map((p) => byId.get(p.assetId) ?? p);
        const have = new Set(kept.map((p) => p.assetId));
        show([...kept, ...changed.filter((p) => !have.has(p.assetId))]);
        for (const p of changed) pending.current.set(p.assetId, p);
        for (const id of removed) pending.current.set(id, null);
      }
      if (movedNotes.length > 0) {
        const byId = new Map(movedNotes.map((n) => [n.id, n]));
        showNotes(current.current.notes.map((n) => ({ ...n, ...byId.get(n.id) })));
        for (const n of movedNotes) spots.current.add(n.id);
      }
      void flush();
    },
    [flush, show, showNotes]
  );

  /** Drops a photo that was deleted or moved to another board; the server has already done the same. */
  const forget = useCallback(
    (assetId: string) => {
      pending.current.delete(assetId);
      show(current.current.placements.filter((p) => p.assetId !== assetId));
    },
    [show]
  );

  /** Adds an empty note. It is not saved until something is written on it. */
  const addNote = useCallback(
    (at: NewNote): string => {
      const id = `new-${crypto.randomUUID()}`;
      typing.current.add(id);
      showNotes([...current.current.notes, { id, text: "", ...at }]);
      return id;
    },
    [showNotes]
  );

  const typeNote = useCallback(
    (id: string, text: string) => {
      typing.current.add(id);
      showNotes(current.current.notes.map((n) => (n.id === id ? { ...n, text } : n)));
    },
    [showNotes]
  );

  const deleteNote = useCallback(
    (id: string) => {
      for (const set of [typing, creates, texts, spots]) set.current.delete(id);
      if (serverIds.current!.has(id) || creating.current === id) deletes.current.add(id);
      showNotes(current.current.notes.filter((n) => n.id !== id));
      void flush();
    },
    [flush, showNotes]
  );

  /** Saves what was written, or removes a note left empty. */
  const finishNote = useCallback(
    (id: string): "kept" | "removed" => {
      const note = current.current.notes.find((n) => n.id === id);
      if (!note) return "kept";
      typing.current.delete(id);
      const text = note.text.trim();
      if (!text) {
        deleteNote(id);
        return "removed";
      }
      if (text !== note.text) showNotes(current.current.notes.map((n) => (n.id === id ? { ...n, text } : n)));
      if (!serverIds.current!.has(id) && creating.current !== id) creates.current.add(id);
      else if (savedText.current!.get(id) !== text) texts.current.add(id);
      else texts.current.delete(id);
      void flush();
      return "kept";
    },
    [deleteNote, flush, showNotes]
  );

  // Warn before leaving with something that has not been saved.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      const written = current.current.notes.some((n) => typing.current.has(n.id) && n.text.trim() !== (savedText.current!.get(n.id) ?? ""));
      if (saveProblem || written) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveProblem]);

  return { placements, notes, commit, forget, addNote, typeNote, finishNote, deleteNote, saveProblem, retry: flush, savedCount };
}
