"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { BOARD_NAME_MAX, type BoardSummary } from "@/lib/boards";
import { readApiError } from "@/components/board/types";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The creator's Vision Boards (DIG-25): open, create, rename, reorder, and delete. `limitReached`
 * is the plan message to show instead of the create form, or null.
 */
export function BoardList({ boards: initial, limitReached }: { boards: BoardSummary[]; limitReached: string | null }) {
  const router = useRouter();
  const id = useId();
  const [boards, setBoards] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(url: string, method: string, body: unknown, fallback: string): Promise<Response | null> {
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await readApiError(res, fallback));
        return null;
      }
      return res;
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      return null;
    }
  }

  async function create(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setError("Give the board a name.");
      return;
    }
    setCreating(true);
    const res = await send("/api/boards", "POST", { name }, "Could not create the board.");
    setCreating(false);
    if (!res) return;
    const { board } = (await res.json()) as { board: BoardSummary };
    setBoards((prev) => [...prev, board]);
    setNewName("");
    setAnnouncement(`Board “${board.name}” created.`);
    router.refresh();
  }

  function startRename(board: BoardSummary) {
    setDeletingId(null);
    setRenamingId(board.id);
    setRenameValue(board.name);
  }

  async function saveRename(e: React.SyntheticEvent<HTMLFormElement>, board: BoardSummary) {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name) {
      setError("Give the board a name.");
      return;
    }
    setBusy(true);
    const res = await send(`/api/boards/${encodeURIComponent(board.id)}`, "PATCH", { name }, "Could not rename the board.");
    setBusy(false);
    if (!res) return;
    setBoards((prev) => prev.map((b) => (b.id === board.id ? { ...b, name } : b)));
    setRenamingId(null);
    setAnnouncement(`Board renamed to “${name}”.`);
    router.refresh();
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= boards.length) return;
    const previous = boards;
    const next = [...boards];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setBoards(next);
    const res = await send("/api/boards/reorder", "POST", { orderedIds: next.map((b) => b.id) }, "Could not save the new order.");
    if (!res) {
      setBoards(previous);
      return;
    }
    setAnnouncement(`“${item.name}” moved to position ${target + 1} of ${next.length}.`);
    router.refresh();
  }

  function startDelete(board: BoardSummary) {
    setRenamingId(null);
    setDeletingId(board.id);
    setMoveTo(boards.find((b) => b.id !== board.id)?.id ?? "");
  }

  async function confirmDelete(board: BoardSummary) {
    setBusy(true);
    const body = board.photoCount > 0 ? { moveToBoardId: moveTo } : {};
    const res = await send(`/api/boards/${encodeURIComponent(board.id)}`, "DELETE", body, "Could not delete the board.");
    setBusy(false);
    if (!res) return;
    setBoards((prev) =>
      prev
        .filter((b) => b.id !== board.id)
        .map((b) => (b.id === moveTo && board.photoCount > 0 ? { ...b, photoCount: b.photoCount + board.photoCount } : b))
    );
    setDeletingId(null);
    setAnnouncement(`Board “${board.name}” deleted.`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {error ? (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-xs font-medium underline underline-offset-2">
            Dismiss
          </button>
        </div>
      ) : null}

      <ol aria-label="Boards" className="divide-y divide-paper-200 overflow-hidden rounded-2xl border border-paper-300 bg-white">
        {boards.map((board, index) => {
          const renaming = renamingId === board.id;
          const deleting = deletingId === board.id;
          const others = boards.filter((b) => b.id !== board.id);
          return (
            <li key={board.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {renaming ? (
                  <form onSubmit={(e) => void saveRename(e, board)} noValidate className="flex flex-1 flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`${id}-rename`} className="block font-mono text-xs uppercase tracking-wider text-ink-700">
                        Board name
                      </label>
                      <input
                        id={`${id}-rename`}
                        value={renameValue}
                        maxLength={BOARD_NAME_MAX}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2 text-sm text-ink-900 shadow-xs focus:border-vermilion-500 focus:outline-hidden focus:ring-2 focus:ring-vermilion-500/20"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      aria-busy={busy}
                      className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800 disabled:opacity-60"
                    >
                      Save name
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="px-2 py-2 text-sm font-medium text-ink-700 underline underline-offset-2"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <span className="min-w-0">
                    <Link
                      href={`/boards/${board.id}`}
                      className="block truncate font-serif text-lg font-bold text-ink-900 underline-offset-2 hover:underline"
                    >
                      {board.name}
                    </Link>
                    <span className="block text-xs text-ink-500">
                      {plural(board.photoCount, "photo", "photos")} · {plural(board.zineCount, "zine", "zines")}
                    </span>
                  </span>
                )}

                {renaming ? null : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${board.name} up`}
                      className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void move(index, 1)}
                      disabled={index === boards.length - 1}
                      aria-label={`Move ${board.name} down`}
                      className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(board)}
                      aria-label={`Rename ${board.name}`}
                      className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    {boards.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => startDelete(board)}
                        aria-label={`Delete ${board.name}`}
                        aria-expanded={deleting}
                        className="rounded-lg border border-paper-300 p-1.5 text-ink-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              {deleting ? (
                <div role="group" aria-label={`Delete ${board.name}`} className="mt-3 rounded-xl border border-paper-300 bg-paper-100 p-4 text-sm">
                  {board.zineCount > 0 ? (
                    <p className="text-ink-700">
                      {plural(board.zineCount, "zine is", "zines are")} built from “{board.name}”. Delete{" "}
                      {board.zineCount === 1 ? "it" : "them"} or move {board.zineCount === 1 ? "it" : "them"} to another board
                      before deleting this board.
                    </p>
                  ) : (
                    <>
                      {board.photoCount > 0 ? (
                        <div>
                          <label htmlFor={`${id}-move-to`} className="block font-mono text-xs uppercase tracking-wider text-ink-700">
                            Move its {plural(board.photoCount, "photo", "photos")} to
                          </label>
                          <select
                            id={`${id}-move-to`}
                            value={moveTo}
                            onChange={(e) => setMoveTo(e.target.value)}
                            className="mt-1.5 w-full max-w-xs rounded-xl border border-paper-300 bg-white px-3 py-2 text-sm text-ink-900"
                          >
                            {others.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <p className="text-ink-700">“{board.name}” is empty.</p>
                      )}
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void confirmDelete(board)}
                          disabled={busy}
                          aria-busy={busy}
                          className="rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
                        >
                          {busy ? "Deleting…" : "Delete board"}
                        </button>
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeletingId(null)}
                    className="mt-3 font-medium text-ink-700 underline underline-offset-2"
                  >
                    Keep board
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {limitReached ? (
        <section aria-labelledby={`${id}-limit`} className="rounded-2xl border border-paper-300 bg-white p-5 shadow-xs">
          <h2 id={`${id}-limit`} className="font-serif text-lg font-bold text-ink-900">
            New board
          </h2>
          <p className="mt-1 text-sm text-ink-700">{limitReached}</p>
          <Link
            href="/billing"
            className="mt-3 inline-flex rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800"
          >
            Upgrade to Pro
          </Link>
        </section>
      ) : (
        <form onSubmit={(e) => void create(e)} noValidate className="rounded-2xl border border-paper-300 bg-white p-5 shadow-xs">
          <h2 className="font-serif text-lg font-bold text-ink-900">New board</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor={`${id}-new`} className="block font-mono text-xs uppercase tracking-wider text-ink-700">
                New board name
              </label>
              <input
                id={`${id}-new`}
                value={newName}
                maxLength={BOARD_NAME_MAX}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2 text-sm text-ink-900 shadow-xs focus:border-vermilion-500 focus:outline-hidden focus:ring-2 focus:ring-vermilion-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              aria-busy={creating}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {creating ? "Creating…" : "Create board"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
