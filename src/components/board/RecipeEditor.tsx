"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { matchSavedRecipe, type SavedRecipe } from "@/lib/recipe-library";
import type { FoundRecipe } from "@/lib/fuji-makernote";
import {
  COLOR_CHROME_LEVELS,
  DYNAMIC_RANGES,
  EXPOSURE_COMPENSATION,
  FILM_SIMULATIONS,
  GRAIN_EFFECTS,
  ISO_OPTIONS,
  KELVIN_RANGE,
  RECIPE_NAME_MAX,
  TONE_SETTINGS,
  WB_SHIFT_RANGE,
  WHITE_BALANCE_MODES,
  formatSigned,
  fujiRecipeSchema,
  steps,
  type FujiRecipe,
  type ToneKey,
} from "@/lib/fuji-recipe";

interface RecipeEditorProps {
  /** Asset label used in the dialog heading. */
  assetLabel: string;
  initial: FujiRecipe | null;
  /** Settings read from the photo. The name stays empty until the creator saves. */
  prefill?: FoundRecipe | null;
  open: boolean;
  onClose: () => void;
  /** Persist the recipe. `null` removes it. Resolve with an error message to keep the dialog open. */
  onSave: (recipe: FujiRecipe | null) => Promise<string | null>;
  /** The creator's saved recipes (DIG-24). Without them, no library controls show. */
  savedRecipes?: SavedRecipe[];
  /** The saved recipe this photo is linked to, if any. */
  linkedRecipeId?: string | null;
  /** Link the photo to a saved recipe, or unlink it with null. Resolve with an error message. */
  onLink?: (recipeId: string | null) => Promise<string | null>;
  /** Save the recipe in the form to the library and link the photo. Resolve with an error message. */
  onSaveToLibrary?: (recipe: FujiRecipe) => Promise<string | null>;
  /** Show "Remove recipe" for an existing recipe. Off when editing the library itself. */
  allowRemove?: boolean;
}

/** Form state: every select holds a string, and "" means "Not set". */
interface FormState {
  name: string;
  filmSimulation: string;
  dynamicRange: string;
  grain: string;
  colorChrome: string;
  colorChromeFxBlue: string;
  wbMode: string;
  kelvin: string;
  wbRed: string;
  wbBlue: string;
  tones: Record<ToneKey, string>;
  iso: string;
  evFrom: string;
  evTo: string;
}

const TONE_KEYS = Object.keys(TONE_SETTINGS) as ToneKey[];

function toForm(recipe: (FoundRecipe & { name?: string }) | null): FormState {
  const [evFrom = "", evTo = ""] = recipe?.exposureCompensation?.split(" to ") ?? [];
  const wb = recipe?.whiteBalance;
  return {
    name: recipe?.name ?? "",
    filmSimulation: recipe?.filmSimulation ?? "",
    dynamicRange: recipe?.dynamicRange ?? "",
    grain: recipe?.grain ?? "",
    colorChrome: recipe?.colorChrome ?? "",
    colorChromeFxBlue: recipe?.colorChromeFxBlue ?? "",
    wbMode: wb?.mode ?? "",
    kelvin: wb?.kelvin !== undefined ? String(wb.kelvin) : "",
    wbRed: wb ? String(wb.red) : "0",
    wbBlue: wb ? String(wb.blue) : "0",
    tones: Object.fromEntries(TONE_KEYS.map((k) => [k, recipe?.[k] !== undefined ? String(recipe[k]) : ""])) as Record<
      ToneKey,
      string
    >,
    iso: recipe?.iso ?? "",
    evFrom,
    evTo,
  };
}

/** Builds the recipe from the form, or returns the first problem to show. */
function fromForm(form: FormState): { recipe: FujiRecipe } | { error: string } {
  const name = form.name.trim();
  if (!name) return { error: "Give the recipe a name." };
  if (!form.filmSimulation) return { error: "Choose a film simulation." };

  const draft: Record<string, unknown> = { name, filmSimulation: form.filmSimulation };
  if (form.dynamicRange) draft.dynamicRange = form.dynamicRange;
  if (form.grain) draft.grain = form.grain;
  if (form.colorChrome) draft.colorChrome = form.colorChrome;
  if (form.colorChromeFxBlue) draft.colorChromeFxBlue = form.colorChromeFxBlue;

  if (form.wbMode) {
    const wb: Record<string, unknown> = { mode: form.wbMode };
    if (form.wbMode === "Kelvin") {
      const kelvin = Number(form.kelvin);
      if (
        !form.kelvin.trim() ||
        !Number.isInteger(kelvin) ||
        kelvin < KELVIN_RANGE.min ||
        kelvin > KELVIN_RANGE.max ||
        kelvin % KELVIN_RANGE.step !== 0
      ) {
        return { error: `Kelvin must be ${KELVIN_RANGE.min}K to ${KELVIN_RANGE.max}K, in steps of ${KELVIN_RANGE.step}K.` };
      }
      wb.kelvin = kelvin;
    }
    wb.red = Number(form.wbRed);
    wb.blue = Number(form.wbBlue);
    draft.whiteBalance = wb;
  }

  for (const key of TONE_KEYS) {
    if (form.tones[key] !== "") draft[key] = Number(form.tones[key]);
  }
  if (form.iso) draft.iso = form.iso;

  if (form.evFrom && form.evTo) {
    if (EXPOSURE_COMPENSATION.indexOf(form.evFrom) >= EXPOSURE_COMPENSATION.indexOf(form.evTo)) {
      return { error: "The exposure range has to go from lower to higher." };
    }
    draft.exposureCompensation = `${form.evFrom} to ${form.evTo}`;
  } else if (form.evFrom || form.evTo) {
    draft.exposureCompensation = form.evFrom || form.evTo;
  }

  // The same schema the API enforces, so the dialog never sends something the server rejects.
  const parsed = fujiRecipeSchema.safeParse(draft);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the recipe settings." };
  return { recipe: parsed.data };
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-xs focus:border-vermilion-500 focus:outline-hidden focus:ring-2 focus:ring-vermilion-500/20";
const labelClass = "block font-mono text-[11px] uppercase tracking-wider text-ink-700";

/** A labelled select. Top level, so React keeps the same element (and focus) between renders. */
function Select({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "Not set",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {placeholder !== null ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RecipeEditor({
  assetLabel,
  initial,
  prefill = null,
  open,
  onClose,
  onSave,
  savedRecipes = [],
  linkedRecipeId = null,
  onLink,
  onSaveToLibrary,
  allowRemove = true,
}: RecipeEditorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [form, setForm] = useState<FormState>(() => toForm(initial ?? (prefill ? { ...prefill, name: "" } : null)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reviewingFound = prefill !== null && initial === null;
  const linked = linkedRecipeId ? savedRecipes.find((r) => r.id === linkedRecipeId) ?? null : null;
  const match = reviewingFound && !linked ? matchSavedRecipe(prefill, savedRecipes) : null;
  const [pick, setPick] = useState(savedRecipes[0]?.id ?? "");
  const pickId = savedRecipes.some((r) => r.id === pick) ? pick : (savedRecipes[0]?.id ?? "");

  /** Runs a library action, keeping the dialog open with the error if it fails. */
  async function act(action: () => Promise<string | null>) {
    setSaving(true);
    setError(null);
    const message = await action();
    setSaving(false);
    if (message) setError(message);
  }

  function saveToLibrary() {
    const result = fromForm(form);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (onSaveToLibrary) void act(() => onSaveToLibrary(result.recipe));
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setForm(toForm(initial ?? (prefill ? { ...prefill, name: "" } : null)));
      setError(null);
      setSaving(false);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, initial, prefill]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(recipe: FujiRecipe | null) {
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
    const result = fromForm(form);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    await submit(result.recipe);
  }

  const plain = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));
  const signed = (list: number[]) => list.map((n) => ({ value: String(n), label: formatSigned(n) }));
  const shiftOptions = signed(steps(WB_SHIFT_RANGE.min, WB_SHIFT_RANGE.max, 1));

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        if (saving) e.preventDefault();
      }}
      aria-labelledby={`${id}-heading`}
      className="w-[min(100vw-2rem,40rem)] rounded-2xl border border-paper-300 bg-paper-50 p-0 text-ink-900 shadow-2xl backdrop:bg-ink-900/50"
    >
      <form onSubmit={handleSubmit} noValidate className="flex max-h-[88vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-paper-300 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={`${id}-heading`} className="font-serif text-xl font-bold">
              {initial ? "Edit film recipe" : "Add a film recipe"}
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

        <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <p className="text-xs text-ink-500">
            The in-camera settings behind this photo. They&apos;re shown on the back of its card when the zine is
            published. Leave anything you didn&apos;t set as &ldquo;Not set&rdquo;.
          </p>
          {reviewingFound ? (
            <p className="rounded-xl border border-paper-300 bg-paper-100 px-3.5 py-2.5 text-xs text-ink-700">
              Found in this photo. Give it a name and save it. Nothing is kept until you do.
            </p>
          ) : null}

          {linked && onLink ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-paper-300 bg-paper-100 px-3.5 py-2.5 text-xs text-ink-700">
              <span>
                Linked to your saved recipe “{linked.recipe.name}”. Changes on the Recipes page apply to every photo using it;
                saving changes here makes this photo&apos;s recipe its own.
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => void act(() => onLink(null))}
                className="font-semibold text-ink-900 underline underline-offset-2 disabled:opacity-50"
              >
                Unlink
              </button>
            </div>
          ) : null}

          {match && onLink ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-vermilion-500/40 bg-vermilion-500/5 px-3.5 py-2.5 text-xs text-ink-800">
              <span>These settings match your saved recipe “{match.recipe.name}”.</span>
              <button
                type="button"
                disabled={saving}
                onClick={() => void act(() => onLink(match.id))}
                className="rounded-lg bg-ink-900 px-3 py-1.5 font-semibold text-paper-50 disabled:opacity-50"
              >
                Use {match.recipe.name}
              </button>
            </div>
          ) : null}

          {savedRecipes.length > 0 && !linked && onLink ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={`${id}-saved`} className={labelClass}>
                  Use a saved recipe
                </label>
                <select id={`${id}-saved`} value={pickId} onChange={(e) => setPick(e.target.value)} className={inputClass}>
                  {savedRecipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.recipe.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={saving || !pickId}
                onClick={() => void act(() => onLink(pickId))}
                className="rounded-xl border border-paper-300 bg-white px-4 py-2 text-sm font-medium text-ink-800 transition hover:bg-paper-100 disabled:opacity-50"
              >
                Use saved recipe
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-name`} className={labelClass}>
                Recipe name
              </label>
              <input
                id={`${id}-name`}
                value={form.name}
                maxLength={RECIPE_NAME_MAX}
                placeholder="e.g. Kodachrome 64"
                onChange={(e) => set("name", e.target.value)}
                className={inputClass}
              />
            </div>
            <Select
              id={`${id}-sim`}
              label="Film simulation"
              value={form.filmSimulation}
              onChange={(v) => set("filmSimulation", v)}
              options={plain(FILM_SIMULATIONS)}
              placeholder="Choose a film simulation"
            />
          </div>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 font-serif text-sm font-bold text-ink-900">Image quality</legend>
            <Select id={`${id}-dr`} label="Dynamic range" value={form.dynamicRange} onChange={(v) => set("dynamicRange", v)} options={plain(DYNAMIC_RANGES)} />
            <Select id={`${id}-grain`} label="Grain effect" value={form.grain} onChange={(v) => set("grain", v)} options={plain(GRAIN_EFFECTS)} />
            <Select id={`${id}-cc`} label="Color Chrome Effect" value={form.colorChrome} onChange={(v) => set("colorChrome", v)} options={plain(COLOR_CHROME_LEVELS)} />
            <Select id={`${id}-ccb`} label="Color Chrome FX Blue" value={form.colorChromeFxBlue} onChange={(v) => set("colorChromeFxBlue", v)} options={plain(COLOR_CHROME_LEVELS)} />
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 font-serif text-sm font-bold text-ink-900">White balance</legend>
            <Select id={`${id}-wb`} label="White balance" value={form.wbMode} onChange={(v) => set("wbMode", v)} options={plain(WHITE_BALANCE_MODES)} />
            {form.wbMode === "Kelvin" ? (
              <div>
                <label htmlFor={`${id}-kelvin`} className={labelClass}>
                  Kelvin
                </label>
                <input
                  id={`${id}-kelvin`}
                  type="number"
                  inputMode="numeric"
                  min={KELVIN_RANGE.min}
                  max={KELVIN_RANGE.max}
                  step={KELVIN_RANGE.step}
                  value={form.kelvin}
                  placeholder="e.g. 5200"
                  onChange={(e) => set("kelvin", e.target.value)}
                  className={inputClass}
                />
              </div>
            ) : (
              <span className="hidden sm:block" />
            )}
            {form.wbMode ? (
              <>
                <Select id={`${id}-wbr`} label="White balance red shift" value={form.wbRed} onChange={(v) => set("wbRed", v)} options={shiftOptions} placeholder={null} />
                <Select id={`${id}-wbb`} label="White balance blue shift" value={form.wbBlue} onChange={(v) => set("wbBlue", v)} options={shiftOptions} placeholder={null} />
              </>
            ) : null}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 font-serif text-sm font-bold text-ink-900">Tone and detail</legend>
            {TONE_KEYS.map((key) => {
              const t = TONE_SETTINGS[key];
              return (
                <Select
                  key={key}
                  id={`${id}-${key}`}
                  label={t.label}
                  value={form.tones[key]}
                  onChange={(v) => setForm((f) => ({ ...f, tones: { ...f.tones, [key]: v } }))}
                  options={signed(steps(t.min, t.max, t.step))}
                />
              );
            })}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 font-serif text-sm font-bold text-ink-900">Exposure</legend>
            <Select id={`${id}-iso`} label="ISO" value={form.iso} onChange={(v) => set("iso", v)} options={plain(ISO_OPTIONS)} />
            <Select id={`${id}-ev`} label="Exposure compensation" value={form.evFrom} onChange={(v) => set("evFrom", v)} options={plain(EXPOSURE_COMPENSATION)} />
            <Select id={`${id}-evto`} label="Exposure compensation up to" value={form.evTo} onChange={(v) => set("evTo", v)} options={plain(EXPOSURE_COMPENSATION)} placeholder="No range" />
          </fieldset>

          {error ? (
            <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-paper-300 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-4">
            {initial && allowRemove ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit(null)}
                className="text-sm font-medium text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
              >
                Remove recipe
              </button>
            ) : null}
            {initial && !linked && onSaveToLibrary ? (
              <button
                type="button"
                disabled={saving}
                onClick={saveToLibrary}
                className="text-sm font-medium text-ink-800 underline underline-offset-2 disabled:opacity-50"
              >
                Save to library
              </button>
            ) : null}
          </div>
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
              className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save recipe"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
