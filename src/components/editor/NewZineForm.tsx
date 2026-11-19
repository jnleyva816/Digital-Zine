"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { readApiError } from "@/components/board/types";
import { ZINE_LIMITS } from "./editor-state";

/**
 * `limitReached` is the message to show instead of the form when the creator's plan allows no
 * more zines (DIG-32), or null. The zine is built from the board picked here (DIG-25).
 */
export function NewZineForm({
  boards,
  initialBoardId,
  limitReached,
}: {
  boards: { id: string; name: string }[];
  initialBoardId?: string;
  limitReached: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [title, setTitle] = useState("");
  const [boardId, setBoardId] = useState(
    boards.some((b) => b.id === initialBoardId) ? (initialBoardId as string) : (boards[0]?.id ?? "")
  );
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give the zine a title.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/zines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, boardId }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not create the zine."));
      const { zine } = (await res.json()) as { zine: { id: string } };
      router.push(`/editor/${zine.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the zine.");
      setCreating(false);
    }
  }

  if (limitReached) {
    return (
      <section aria-labelledby={`${id}-limit`} className="rounded-2xl border border-paper-300 bg-white p-5 shadow-sm">
        <h2 id={`${id}-limit`} className="font-serif text-lg font-bold text-ink-900">
          Start a new zine
        </h2>
        <p className="mt-1 text-sm text-ink-700">{limitReached}</p>
        <Link
          href="/billing"
          className="mt-3 inline-flex rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800"
        >
          Upgrade to Pro
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-paper-300 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-lg font-bold text-ink-900">Start a new zine</h2>
      <p id={`${id}-hint`} className="mt-1 text-xs text-ink-500">
        A new zine starts with up to 8 photos from the board you pick. You can change the pages in the editor.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={`${id}-title`} className="block font-mono text-xs uppercase tracking-wider text-ink-700">
            Title
          </label>
          <input
            id={`${id}-title`}
            value={title}
            maxLength={ZINE_LIMITS.title}
            aria-describedby={`${id}-hint`}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20"
          />
        </div>
        <div className="sm:w-48">
          <label htmlFor={`${id}-board`} className="block font-mono text-xs uppercase tracking-wider text-ink-700">
            Board
          </label>
          <select
            id={`${id}-board`}
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={creating}
          aria-busy={creating}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {creating ? "Creating…" : "Create zine"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
          {error}
        </p>
      ) : null}
    </form>
  );
}
