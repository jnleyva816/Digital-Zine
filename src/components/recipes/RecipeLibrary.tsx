"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { FujiRecipe } from "@/lib/fuji/fuji-recipe";
import type { SavedRecipe } from "@/lib/fuji/recipe-library";
import { RecipeEditor } from "@/components/board/RecipeEditor";
import { readApiError } from "@/components/board/types";

const photos = (n: number) => `${n} photo${n === 1 ? "" : "s"}`;

/**
 * The creator's saved Fujifilm recipes (DIG-24): create, edit, and delete. Editing a recipe
 * changes it on every photo linked to it; deleting one leaves those photos with a copy.
 */
export function RecipeLibrary({ initial }: { initial: SavedRecipe[] }) {
  const router = useRouter();
  const [recipes, setRecipes] = useState(initial);
  /** "new", a recipe id being edited, or null when the dialog is closed. */
  const [editing, setEditing] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const current = editing && editing !== "new" ? recipes.find((r) => r.id === editing) ?? null : null;

  async function save(recipe: FujiRecipe | null): Promise<string | null> {
    if (!recipe) return null;
    const isNew = editing === "new";
    try {
      const res = await fetch(isNew ? "/api/recipes" : `/api/recipes/${encodeURIComponent(editing ?? "")}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe }),
      });
      if (!res.ok) return await readApiError(res, "Could not save the recipe.");
      const body = (await res.json()) as { recipe: SavedRecipe };
      setRecipes((prev) =>
        (isNew ? [...prev, body.recipe] : prev.map((r) => (r.id === body.recipe.id ? body.recipe : r))).sort((a, b) =>
          a.recipe.name.localeCompare(b.recipe.name)
        )
      );
      setEditing(null);
      setAnnouncement(isNew ? `Saved “${recipe.name}”.` : `Updated “${recipe.name}”.`);
      router.refresh();
      return null;
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
  }

  async function remove(saved: SavedRecipe) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(saved.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not delete the recipe."));
      setRecipes((prev) => prev.filter((r) => r.id !== saved.id));
      setDeletingId(null);
      setAnnouncement(`Deleted “${saved.recipe.name}”.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the recipe.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-y-6">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        New recipe
      </button>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {recipes.length === 0 ? (
        <div className="rounded-2xl border border-paper-300 bg-white px-6 py-12 text-center">
          <h2 className="font-serif text-xl font-bold text-ink-900">No saved recipes yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
            Save a recipe once and use it on many photos. You can also save a photo&apos;s recipe from its recipe dialog on
            the board.
          </p>
        </div>
      ) : (
        <ol aria-label="Saved recipes" className="divide-y divide-paper-200 overflow-hidden rounded-2xl border border-paper-300 bg-white">
          {recipes.map((saved) => (
            <li key={saved.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-serif text-lg font-bold text-ink-900">
                    <SlidersHorizontal className="h-4 w-4 text-vermilion-500" aria-hidden="true" />
                    {saved.recipe.name}
                  </span>
                  <span className="block text-xs text-ink-500">
                    {saved.recipe.filmSimulation} · Used on {photos(saved.photoCount)}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(saved.id)}
                    aria-label={`Edit ${saved.recipe.name}`}
                    className="rounded-lg border border-paper-300 p-1.5 text-ink-700 transition hover:bg-paper-100"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(deletingId === saved.id ? null : saved.id)}
                    aria-label={`Delete ${saved.recipe.name}`}
                    aria-expanded={deletingId === saved.id}
                    className="rounded-lg border border-paper-300 p-1.5 text-ink-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              </div>
              {deletingId === saved.id ? (
                <div role="group" aria-label={`Delete ${saved.recipe.name}`} className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-paper-300 bg-paper-100 p-3 text-sm">
                  <span className="text-ink-700">
                    <span className="font-medium">Delete “{saved.recipe.name}”?</span>{" "}
                    <span>
                      {saved.photoCount > 0 ? `Its ${photos(saved.photoCount)} keep a copy of the settings.` : "No photos use it."}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(saved)}
                    disabled={busy}
                    aria-busy={busy}
                    className="rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
                  >
                    {busy ? "Deleting…" : "Delete recipe"}
                  </button>
                  <button type="button" onClick={() => setDeletingId(null)} className="font-medium text-ink-700 underline underline-offset-2">
                    Keep
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {editing ? (
        <RecipeEditor
          key={editing}
          open
          assetLabel={
            current
              ? `Saving changes this recipe on ${photos(current.photoCount)}.`
              : "Saved to your recipe library."
          }
          initial={current?.recipe ?? null}
          allowRemove={false}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </div>
  );
}
