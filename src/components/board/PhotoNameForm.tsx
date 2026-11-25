import { useId, useState } from "react";
import { PHOTO_NAME_MAX } from "@/lib/limits";

/**
 * Names a photo in the app (DIG-34). The camera's file name is kept; saving blank clears the name
 * so the file name shows again. Rendered inside the client board.
 */
export function PhotoNameForm({
  fileName,
  initialName,
  onSave,
  onCancel,
}: {
  fileName: string | null;
  initialName: string | null;
  /** Resolves with an error message, or null once saved. */
  onSave: (name: string | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const failure = await onSave(value.trim() || null);
    setSaving(false);
    if (failure) setError(failure);
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-2 rounded-xl border border-paper-300 bg-paper-100 p-3 text-xs">
      <div>
        <label htmlFor={`${id}-name`} className="block font-mono uppercase tracking-wider text-ink-700">
          Photo name
        </label>
        <input
          id={`${id}-name`}
          value={value}
          maxLength={PHOTO_NAME_MAX}
          autoFocus
          aria-describedby={`${id}-hint`}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-full rounded-lg border border-paper-300 bg-white px-2.5 py-1.5 text-sm text-ink-900 focus:border-vermilion-500 focus:outline-hidden focus:ring-2 focus:ring-vermilion-500/20"
        />
        <p id={`${id}-hint`} className="mt-1 text-ink-500">
          {fileName ? `Leave blank to use the file name, ${fileName}.` : "Leave blank to show no name."}
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-red-800">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          aria-busy={saving}
          className="rounded-lg bg-ink-900 px-3 py-1.5 font-semibold text-paper-50 transition hover:bg-ink-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save name"}
        </button>
        <button type="button" onClick={onCancel} className="font-medium text-ink-700 underline underline-offset-2">
          Cancel
        </button>
      </div>
    </form>
  );
}
