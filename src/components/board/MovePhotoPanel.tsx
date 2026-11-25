import { useId, useState } from "react";
import { quoteList } from "./board-utils";

/**
 * Moves one photo to another of the creator's boards (DIG-25). When zines use the photo, it says
 * which ones before the move: the photo stays on their pages. Rendered inside the client board.
 */
export function MovePhotoPanel({
  label,
  boards,
  usedIn,
  onMove,
  onCancel,
}: {
  label: string;
  boards: { id: string; name: string }[];
  /** Titles of zines whose pages use this photo. */
  usedIn: string[];
  /** Resolves with an error message, or null once the photo has moved. */
  onMove: (boardId: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const id = useId();
  const [target, setTarget] = useState(boards[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  async function move() {
    setMoving(true);
    setError(null);
    const failure = await onMove(target);
    setMoving(false);
    if (failure) setError(failure);
  }

  return (
    <div role="group" aria-label={`Move ${label}`} className="stack-y-2 rounded-xl border border-paper-300 bg-paper-100 p-3 text-xs">
      <div>
        <label htmlFor={`${id}-board`} className="block font-mono uppercase tracking-wider text-ink-700">
          Move to board
        </label>
        <select
          id={`${id}-board`}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="mt-1 w-full rounded-lg border border-paper-300 bg-white px-2.5 py-1.5 text-sm text-ink-900"
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      {usedIn.length > 0 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-amber-900">
          This photo is used in {quoteList(usedIn)}. It stays on {usedIn.length === 1 ? "that zine's" : "those zines'"}{" "}
          pages after the move.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-red-800">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void move()}
          disabled={moving || !target}
          aria-busy={moving}
          className="rounded-lg bg-ink-900 px-3 py-1.5 font-semibold text-paper-50 transition hover:bg-ink-800 disabled:opacity-60"
        >
          {moving ? "Moving…" : "Move photo"}
        </button>
        <button type="button" onClick={onCancel} className="font-medium text-ink-700 underline underline-offset-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
