import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readApiError } from "@/components/board/types";

/**
 * Which board a zine is built from (DIG-25). The board can be switched only while the zine has
 * no pages; after that it is shown as a link. Rendered inside the client editor.
 */
export function ZineBoardPicker({
  zineId,
  boardId,
  boards,
  canChange,
}: {
  zineId: string;
  boardId: string;
  boards: { id: string; name: string }[];
  canChange: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [choice, setChoice] = useState(boardId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const current = boards.find((b) => b.id === boardId);

  if (!canChange || boards.length < 2) {
    return (
      <p className="text-sm text-ink-500">
        Built from{" "}
        <Link href={`/boards/${boardId}`} className="font-medium text-ink-900 underline underline-offset-2">
          {current?.name ?? "your board"}
        </Link>
        .
      </p>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/zines/${encodeURIComponent(zineId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: choice }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Could not change the board."));
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`${id}-board`} className="block font-mono text-xs uppercase tracking-wider text-ink-700">
            Board
          </label>
          <select
            id={`${id}-board`}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            aria-describedby={`${id}-hint`}
            className="mt-1.5 rounded-xl border border-paper-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || choice === boardId}
          aria-busy={saving}
          className="rounded-xl border border-paper-300 bg-white px-4 py-2 text-sm font-medium text-ink-800 transition hover:bg-paper-100 disabled:opacity-50"
        >
          Use this board
        </button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-ink-500">
        You can change the board until the zine has pages.
      </p>
      {error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
