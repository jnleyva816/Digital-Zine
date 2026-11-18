"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { RecipeData } from "@/lib/types";
import { RECIPE_LIMITS } from "./types";

interface RecipeEditorProps {
  /** Asset label used in the dialog heading. */
  assetLabel: string;
  initial: RecipeData | null;
  open: boolean;
  onClose: () => void;
  /** Persist the recipe. `null` removes it. Resolve with an error message to keep the dialog open. */
  onSave: (recipe: RecipeData | null) => Promise<string | null>;
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function validate(recipe: Required<Pick<RecipeData, "ingredients" | "method">> & RecipeData): string | null {
  if (!recipe.title?.trim() && recipe.ingredients.length === 0 && recipe.method.length === 0) {
    return "Add a title, at least one ingredient, or at least one step.";
  }
  if ((recipe.title ?? "").length > RECIPE_LIMITS.title) {
    return `Keep the title under ${RECIPE_LIMITS.title} characters.`;
  }
  if ((recipe.servings ?? "").length > RECIPE_LIMITS.servings) {
    return `Keep servings under ${RECIPE_LIMITS.servings} characters.`;
  }
  if ((recipe.prepTime ?? "").length > RECIPE_LIMITS.prepTime) {
    return `Keep the time under ${RECIPE_LIMITS.prepTime} characters.`;
  }
  if (recipe.ingredients.length > RECIPE_LIMITS.ingredientCount) {
    return `Use at most ${RECIPE_LIMITS.ingredientCount} ingredients.`;
  }
  if (recipe.ingredients.some((i) => i.length > RECIPE_LIMITS.ingredientLength)) {
    return `Keep each ingredient under ${RECIPE_LIMITS.ingredientLength} characters.`;
  }
  if (recipe.method.length > RECIPE_LIMITS.methodCount) {
    return `Use at most ${RECIPE_LIMITS.methodCount} steps.`;
  }
  if (recipe.method.some((m) => m.length > RECIPE_LIMITS.methodLength)) {
    return `Keep each step under ${RECIPE_LIMITS.methodLength} characters.`;
  }
  return null;
}

export function RecipeEditor({ assetLabel, initial, open, onClose, onSave }: RecipeEditorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState("");
  const [prepTime, setPrepTime] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [method, setMethod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setTitle(initial?.title ?? "");
      setServings(initial?.servings ?? "");
      setPrepTime(initial?.prepTime ?? "");
      setIngredients((initial?.ingredients ?? []).join("\n"));
      setMethod((initial?.method ?? []).join("\n"));
      setError(null);
      setSaving(false);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, initial]);

  async function submit(recipe: RecipeData | null) {
    setSaving(true);
    setError(null);
    const message = await onSave(recipe);
    if (message) {
      setError(message);
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const recipe = {
      title: title.trim(),
      servings: servings.trim(),
      prepTime: prepTime.trim(),
      ingredients: splitLines(ingredients),
      method: splitLines(method),
    };
    const problem = validate(recipe);
    if (problem) {
      setError(problem);
      return;
    }
    await submit({
      title: recipe.title,
      ingredients: recipe.ingredients,
      method: recipe.method,
      ...(recipe.servings ? { servings: recipe.servings } : {}),
      ...(recipe.prepTime ? { prepTime: recipe.prepTime } : {}),
    });
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-3.5 py-2 text-sm text-ink-900 shadow-sm focus:border-vermilion-500 focus:outline-none focus:ring-2 focus:ring-vermilion-500/20";
  const labelClass = "block font-mono text-xs uppercase tracking-wider text-ink-700";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        if (saving) e.preventDefault();
      }}
      aria-labelledby={`${formId}-heading`}
      className="w-[min(100vw-2rem,36rem)] rounded-2xl border border-paper-300 bg-paper-50 p-0 text-ink-900 shadow-2xl backdrop:bg-ink-900/50"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-paper-300 px-5 py-4 sm:px-6">
          <div>
            <h2 id={`${formId}-heading`} className="font-serif text-xl font-bold">
              {initial ? "Edit recipe" : "Add a recipe"}
            </h2>
            <p className="mt-0.5 truncate text-xs text-ink-500">{assetLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-1.5 text-ink-500 transition hover:bg-paper-200 hover:text-ink-900 disabled:opacity-50"
            aria-label="Close recipe editor"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <p className="text-xs text-ink-500">
            The recipe is shown on the back of this photo&apos;s card when it is published.
          </p>
          <div>
            <label htmlFor={`${formId}-title`} className={labelClass}>
              Title
            </label>
            <input
              id={`${formId}-title`}
              value={title}
              maxLength={RECIPE_LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${formId}-servings`} className={labelClass}>
                Servings
              </label>
              <input
                id={`${formId}-servings`}
                value={servings}
                maxLength={RECIPE_LIMITS.servings}
                placeholder="e.g. 1 quart"
                onChange={(e) => setServings(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-time`} className={labelClass}>
                Time
              </label>
              <input
                id={`${formId}-time`}
                value={prepTime}
                maxLength={RECIPE_LIMITS.prepTime}
                placeholder="e.g. 20 min + 5 days"
                onChange={(e) => setPrepTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${formId}-ingredients`} className={labelClass}>
              Ingredients
            </label>
            <p id={`${formId}-ingredients-hint`} className="mt-0.5 text-xs text-ink-500">
              One per line.
            </p>
            <textarea
              id={`${formId}-ingredients`}
              aria-describedby={`${formId}-ingredients-hint`}
              value={ingredients}
              rows={5}
              onChange={(e) => setIngredients(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-method`} className={labelClass}>
              Method
            </label>
            <p id={`${formId}-method-hint`} className="mt-0.5 text-xs text-ink-500">
              One step per line.
            </p>
            <textarea
              id={`${formId}-method`}
              aria-describedby={`${formId}-method-hint`}
              value={method}
              rows={6}
              onChange={(e) => setMethod(e.target.value)}
              className={inputClass}
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-paper-300 px-5 py-4 sm:px-6">
          {initial ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit(null)}
              className="text-sm font-medium text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Remove recipe
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-paper-300 px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-paper-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              aria-busy={saving}
              className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-paper-50 shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save recipe"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
