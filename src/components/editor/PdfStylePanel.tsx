"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { FileDown, Loader2 } from "lucide-react";
import { PALETTES, PAPERS, TEMPLATES, TYPEFACES, type PdfPaletteName, type PdfPaper, type PdfTemplate, type PdfTypeface } from "@/lib/pdf-settings";
import { TYPEFACE_FACES } from "@/lib/pdf-typefaces";
import { PREVIEW_WIDTH, PdfPagePreview, WebPhoto, type PreviewPage, type PreviewZine, type WebPhotoSource } from "./PdfPagePreview";
import { Check, Choice, Group, PanelLayout, SaveError, Segment, UpgradePrompt, savedMessage, segments } from "./pdf-panel-ui";
import { webFontFamily } from "./pdf-web-fonts";
import { CoverOptions } from "./CoverOptions";
import { MiniZineGuide, MiniZineOptions, enoughMiniPhotos } from "./MiniZineOptions";
import { RecipeCardOptions } from "./RecipeCardOptions";
import type { PdfStyle } from "./usePdfStyle";

const keysOf = <K extends string>(table: Record<K, unknown>) => Object.keys(table) as K[];

const THUMBS: Record<PdfTemplate, string> = {
  darkroom: "bg-ink-900",
  contact: "bg-[#111] px-[3px] py-[7px]",
  gallery: "bg-white p-[9px] ring-1 ring-inset ring-paper-200",
  riso: "bg-[#F2EDE4]",
};

/** The template's photo treatment, on the zine's own first photo. */
function Thumb({ template, photo }: { template: PdfTemplate; photo?: WebPhotoSource }) {
  const holes = { backgroundImage: "radial-gradient(circle, #E4E8E2 1.4px, transparent 1.6px)", backgroundSize: "7px 6px" };
  return (
    <span className={`relative block h-14 w-11 shrink-0 overflow-hidden rounded-sm ${THUMBS[template]}`}>
      {template === "contact" ? (
        <>
          <span className="absolute inset-x-0 top-0 h-1.5" style={holes} />
          <span className="absolute inset-x-0 bottom-0 h-1.5" style={holes} />
        </>
      ) : null}
      <span className="relative block h-full w-full">
        {photo ? <WebPhoto photo={photo} fit="cover" inks={template === "riso" ? PALETTES.riso : undefined} halftone={false} sizes="44px" /> : null}
      </span>
    </span>
  );
}

function Figure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="space-y-2.5">
      {children}
      <figcaption className="text-center text-xs text-ink-700">{caption}</figcaption>
    </figure>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-center border border-dashed border-ink-500/50 p-6 text-center text-sm text-ink-700"
      style={{ width: PREVIEW_WIDTH, height: PREVIEW_WIDTH * 1.35 }}
    >
      <p>{children}</p>
    </div>
  );
}

function Preview({ style, zine }: { style: PdfStyle; zine: PreviewZine }) {
  if (zine.pages.length === 0) return <p className="text-sm text-ink-700">Add a page and save to see a preview.</p>;
  if (!style.look) return <p className="text-sm text-ink-700">Pick a template to see your zine in it.</p>;
  const settings = { ...style.look, paper: style.paper ?? style.look.paper };
  const withRecipe = zine.pages.find((p) => p.recipe);
  const without = zine.pages.find((p) => !p.recipe);
  const shown = (page: "cover" | PreviewPage, label: string) => (
    <Figure caption={label}>
      <PdfPagePreview settings={settings} zine={zine} page={page} label={label} />
    </Figure>
  );
  return (
    <>
      <div className="flex flex-wrap items-start justify-center gap-8">
        {shown("cover", "Cover")}
        {withRecipe ? shown(withRecipe, "Photo with a recipe card") : <Missing>No photo in this zine has a recipe on its card.</Missing>}
        {without ? shown(without, "Photo without a recipe") : <Missing>Every photo in this zine has a recipe.</Missing>}
      </div>
      <p className="mt-5 text-center text-[13px] text-ink-700">
        Preview at about a third of {PAPERS[settings.paper].label}. Changes apply to every page of the PDF.
      </p>
    </>
  );
}

interface PdfStylePanelProps {
  style: PdfStyle;
  zine: PreviewZine;
  tier: "free" | "pro";
  dirty: boolean;
  busy: boolean;
  done: boolean;
  exportError: string | null;
  onExport: () => void;
  onClose: () => void;
}

/** "Style your PDF" (DIG-71): how the zine prints, beside pages that change as it is chosen. */
export function PdfStylePanel({ style, zine, tier, dirty, busy, done, exportError, onExport, onClose }: PdfStylePanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cardButton = useRef<HTMLButtonElement>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const { look, paper } = style;
  const mini = style.format === "mini";
  const photo = zine.pages[0]?.photo;
  const count = zine.pages.length;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = () => ref.current?.close();
  function closeCard() {
    // Drawn before focus moves to it.
    flushSync(() => setCardOpen(false));
    cardButton.current?.focus();
  }

  const missing = [look ? null : "a template", paper ? null : "a paper size"].filter(Boolean).join(" and ");
  const message = missing
    ? `Choose ${missing}${mini ? " to download" : tier === "pro" ? " to export" : ""}.`
    : done
      ? (mini ? "Print sheet downloaded." : "PDF downloaded.")
      : savedMessage(style);

  return (
    <dialog
      ref={ref}
      aria-label="Style your PDF"
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-[#ECE8E1] p-0 text-ink-900 lg:overflow-hidden"
    >
      {cardOpen && look ? (
        <RecipeCardOptions style={style} look={look} zine={zine} onBack={closeCard} onClose={close} />
      ) : (
        <PanelLayout
          onClose={close}
          header={
            <>
              <h2 className="font-serif text-2xl font-bold">Style your PDF</h2>
              <p className="mt-1 wrap-break-word text-sm text-ink-700">
                {zine.title} · {count} {count === 1 ? "page" : "pages"}
              </p>
            </>
          }
          choices={
            <>
              <Group title="Format" hint={mini ? "Prints on one Letter or A4 sheet. Fold it, make one cut, and it becomes an 8-page booklet." : undefined}>
                <div className={segments}>
                  <Segment pressed={!mini} onClick={() => style.pickFormat("booklet")}>
                    Booklet PDF
                  </Segment>
                  <Segment pressed={mini} onClick={() => style.pickFormat("mini")}>
                    Mini zine (1 sheet)
                  </Segment>
                </div>
              </Group>

              <Group title="Template">
                <div className="grid grid-cols-2 gap-2">
                  {keysOf<PdfTemplate>(TEMPLATES).map((key) => (
                    <Choice key={key} pressed={look?.template === key} onClick={() => style.pickTemplate(key)} className="flex items-center gap-2.5 p-2 text-left">
                      <Thumb template={key} photo={photo} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{TEMPLATES[key].label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-ink-500">{TEMPLATES[key].description}</span>
                      </span>
                    </Choice>
                  ))}
                </div>
              </Group>

              <Group title="Paper size">
                <div className="grid grid-cols-2 gap-2">
                  {keysOf<PdfPaper>(PAPERS).map((key) => (
                    <Choice key={key} pressed={paper === key} onClick={() => style.pickPaper(key)} className="px-3 py-2 text-left">
                      <span className="block text-sm font-semibold">{PAPERS[key].label}</span>
                      <span className="block text-xs text-ink-500">{PAPERS[key].hint}</span>
                    </Choice>
                  ))}
                </div>
              </Group>

              <CoverOptions style={style} zine={zine} />

              {mini ? <MiniZineOptions style={style} zine={zine} /> : null}

              <Group title="Typeface" hint={look ? TYPEFACES[look.typeface].pair : "Pick a template first. It suggests a typeface and colours, and you can change both."}>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {keysOf<PdfTypeface>(TYPEFACES).map((key) => {
                    const face = TYPEFACE_FACES[key].heading;
                    return (
                      <Choice key={key} pressed={look?.typeface === key} disabled={!look} onClick={() => style.edit({ typeface: key })} className="flex flex-col items-center justify-center gap-1.5 px-1 py-2">
                        <span aria-hidden="true" className="text-[26px] leading-none" style={{ ...face, fontFamily: webFontFamily(face.fontFamily) }}>
                          Aa
                        </span>
                        <span className="text-[11px] text-ink-700">{TYPEFACES[key].label}</span>
                      </Choice>
                    );
                  })}
                </div>
              </Group>

              <Group title="Colours">
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {keysOf<PdfPaletteName>(PALETTES).map((key) => {
                    const { label, page, text, accent } = PALETTES[key];
                    return (
                      <Choice key={key} pressed={look?.palette === key} disabled={!look} onClick={() => style.edit({ palette: key })} className="flex flex-col justify-center gap-1.5 px-1.5 py-2 text-center">
                        <span aria-hidden="true" className="flex h-[26px] w-full overflow-hidden rounded-md border border-black/10">
                          <span className="flex-2" style={{ backgroundColor: page }} />
                          <span className="flex-1" style={{ backgroundColor: text }} />
                          <span className="flex-1" style={{ backgroundColor: accent }} />
                        </span>
                        <span className="-mx-1 text-[10.5px] text-ink-700">{label}</span>
                      </Choice>
                    );
                  })}
                </div>
              </Group>

              <Group title="Pages">
                {(
                  [
                    ["recipeCards", mini ? "Recipe name under photos that have one" : "Recipe card on photos that have one"],
                    ["captions", "Captions"],
                    ["pageNumbers", "Page numbers"],
                  ] as const
                ).map(([key, label]) => (
                  <Check key={key} label={label} checked={look?.[key] ?? false} disabled={!look} onChange={(on) => style.edit({ [key]: on })} />
                ))}
                {mini ? null : (
                  <button
                    ref={cardButton}
                    type="button"
                    disabled={!look}
                    onClick={() => setCardOpen(true)}
                    className="min-h-[44px] text-sm font-medium text-vermilion-600 underline underline-offset-2 disabled:text-ink-500 disabled:no-underline"
                  >
                    Recipe card options
                  </button>
                )}
              </Group>
            </>
          }
          footer={
            <>
              <SaveError style={style} />
              {exportError && !style.error ? (
                <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs text-red-800">
                  {exportError}
                </p>
              ) : null}
              <div className="flex items-center gap-2.5">
                {mini || tier === "pro" ? (
                  <button
                    type="button"
                    onClick={onExport}
                    disabled={!style.settings || busy || (mini && !enoughMiniPhotos(look, zine))}
                    aria-busy={busy}
                    className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-ink-900 text-[15px] font-semibold text-paper-50 transition hover:bg-ink-800 disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
                    {busy ? "Preparing PDF…" : mini ? "Download print sheet" : "Export PDF"}
                  </button>
                ) : (
                  <UpgradePrompt className="flex-1" />
                )}
                <button
                  type="button"
                  onClick={style.reset}
                  disabled={!look}
                  title="Back to the template’s defaults"
                  className="min-h-[46px] rounded-xl border border-paper-300 px-4 text-sm font-medium transition enabled:hover:bg-paper-200 disabled:opacity-40"
                >
                  Reset
                </button>
              </div>
              <p aria-live="polite" className="min-h-4 text-xs text-ink-500">
                {message}
              </p>
              {dirty ? <p className="text-xs text-ink-500">The preview and PDF use the last saved version. Save first to include your changes.</p> : null}
            </>
          }
          asideLabel={mini ? "Folding guide" : "Preview"}
          aside={mini ? <MiniZineGuide style={style} zine={zine} /> : <Preview style={style} zine={zine} />}
        />
      )}
    </dialog>
  );
}
