"use client";

import { useEffect, useId, useRef, useState } from "react";

interface DeleteZineDialogProps {
  open: boolean;
  title: string;
  published: boolean;
  onCancel: () => void;
  /** Resolve with an error message to keep the dialog open. */
  onConfirm: () => Promise<string | null>;
}

export function DeleteZineDialog({ open, title, published, onCancel, onConfirm }: DeleteZineDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      setTyped("");
      setError(null);
      setDeleting(false);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  const matches = typed === title;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!matches) return;
    setDeleting(true);
    setError(null);
    const message = await onConfirm();
    if (message) {
      setError(message);
      setDeleting(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onCancel={(e) => {
        if (deleting) e.preventDefault();
      }}
      aria-labelledby={`${id}-heading`}
      className="w-[min(100vw-2rem,28rem)] rounded-2xl border border-paper-300 bg-paper-50 p-0 text-ink-900 shadow-2xl backdrop:bg-ink-900/50"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <h2 id={`${id}-heading`} className="font-serif text-xl font-bold">
          Delete this zine?
        </h2>
        <p className="text-sm text-ink-700">
          This permanently deletes “{title}” and its pages.
          {published ? " Its public page will stop working." : ""} Your photos stay on your Vision Board.
        </p>
        <div>
          <label htmlFor={`${id}-confirm`} className="block text-sm font-medium text-ink-800">
            Type {title} to confirm
          </label>
          <input
            id={`${id}-confirm`}
            value={typed}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2 text-sm shadow-xs focus:border-red-500 focus:outline-hidden focus:ring-2 focus:ring-red-500/20"
          />
        </div>
        {error ? (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-xl border border-paper-300 px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-paper-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!matches || deleting}
            aria-busy={deleting}
            className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
