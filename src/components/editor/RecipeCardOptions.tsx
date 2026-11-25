"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import {
  CARD_LOCATIONS,
  CARD_STYLES,
  PAPERS,
  RECIPE_CARD_SIZES,
  type CardLocation,
  type CardStyle,
  type PdfSettings,
  type RecipeCardSize,
} from "@/lib/pdf-settings";
import type { RecipeData } from "@/lib/types";
import { PdfPagePreview, type PreviewPage, type PreviewZine } from "./PdfPagePreview";
import { Check, Choice, Group, PanelLayout, SaveError, Segment, savedMessage, segments } from "./pdf-panel-ui";
import type { PdfStyle } from "./usePdfStyle";

/** About half of A4. */
const CARD_PREVIEW_WIDTH = 420;

const keysOf = <K extends string>(table: Record<K, unknown>) => Object.keys(table) as K[];

const SIZE_HINTS: Record<RecipeCardSize, string> = { compact: "3 settings", standard: "6 settings", full: "All 14" };

const SAMPLE: RecipeData = {
  name: "Sample recipe",
  filmSimulation: "Classic Chrome",
  dynamicRange: "DR200",
  grain: "Weak, Small",
  colorChrome: "Strong",
  colorChromeFxBlue: "Off",
  whiteBalance: { mode: "Daylight", red: 2, blue: -5 },
  highlight: 0,
  shadow: 0.5,
  color: 2,
  sharpness: 1,
  clarity: 3,
  noiseReduction: -4,
  iso: "Auto up to ISO 6400",
  exposureCompensation: "0 to +2/3",
};

const mono = "ui-monospace, Menlo, monospace";
const SAMPLES: Record<CardStyle, { text: string; style: CSSProperties }> = {
  outline: { text: "Aa", style: { border: "1px solid #6E655B", borderRadius: 3, fontFamily: "Georgia, serif", fontSize: 13 } },
  label: { text: "REC", style: { border: "1px solid #1F2A30", borderTopWidth: 7, background: "#fff", color: "#1F2A30", fontFamily: mono, fontSize: 8 } },
  wall: { text: "Aa", style: { borderTop: "1px solid #161412", fontFamily: "Georgia, serif", fontSize: 13 } },
  sticker: { text: "K64", style: { border: "2px solid #FF48B0", background: "#F2EDE4", color: "#0058A3", boxShadow: "2px 2px 0 #0058A3", transform: "rotate(3deg)", fontWeight: 700, fontSize: 11 } },
  line: { text: "— — —", style: { fontFamily: mono, fontSize: 9, color: "#6E655B" } },
};

/** Where the mark goes on a 30 × 40 page whose photo is its top part. */
const MARKS: Record<CardLocation, CSSProperties> = {
  "over-tl": { left: 5, top: 5, width: 10, height: 7 },
  "over-tr": { right: 5, top: 5, width: 10, height: 7 },
  "over-br": { right: 5, top: 16, width: 10, height: 7 },
  "over-bl": { left: 5, top: 16, width: 10, height: 7 },
  "beside-caption": { right: 3, top: 28, width: 10, height: 8 },
  "under-caption": { left: 3, right: 3, top: 31, height: 5 },
};

const isDark = (settings: PdfSettings) => settings.palette === "ink";

/** The recipe card's style, size, and place (DIG-72), beside one page that shows it as it will print. */
export function RecipeCardOptions({ style, look, zine, onBack, onClose }: { style: PdfStyle; look: PdfSettings; zine: PreviewZine; onBack: () => void; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Only a way of looking at it: the zine's own colours are not touched.
  const [dark, setDark] = useState(isDark(look));
  const { card } = look;
  const edit = (part: Partial<PdfSettings["card"]>) => style.edit({ card: { ...card, ...part } });

  useEffect(() => heading.current?.focus(), []);

  const own = zine.pages.find((p) => p.recipe);
  const page: PreviewPage | undefined = own ?? (zine.pages[0] && { ...zine.pages[0], recipe: SAMPLE });
  const shown: PdfSettings = {
    ...look,
    paper: style.paper ?? look.paper,
    recipeCards: true,
    palette: dark === isDark(look) ? look.palette : dark ? "ink" : "paper",
  };
  const hidesPhoto = card.size === "full" && card.style !== "line" && card.location.startsWith("over-");

  return (
    <PanelLayout
      onClose={onClose}
      header={
        <>
          <h2 ref={heading} tabIndex={-1} className="font-serif text-2xl font-bold outline-hidden">
            Recipe card
          </h2>
          <p className="mt-1 text-sm text-ink-700">Shown on photos that have a Fujifilm recipe. Applies to every page.</p>
        </>
      }
      choices={
        <>
          <Group title="Style">
            <div className="grid grid-cols-3 gap-1.5">
              {keysOf<CardStyle>(CARD_STYLES).map((key) => (
                <Choice key={key} pressed={card.style === key} onClick={() => edit({ style: key })} className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 p-2">
                  <span aria-hidden="true" className="box-border flex h-[26px] w-11 items-center justify-center" style={SAMPLES[key].style}>
                    {SAMPLES[key].text}
                  </span>
                  <span className="text-xs font-medium">{CARD_STYLES[key]}</span>
                </Choice>
              ))}
            </div>
          </Group>

          <Group title="Size">
            <div className={segments}>
              {keysOf<RecipeCardSize>(RECIPE_CARD_SIZES).map((key) => (
                <Segment key={key} pressed={card.size === key} onClick={() => edit({ size: key })}>
                  <span className="block text-[13px] font-semibold">{RECIPE_CARD_SIZES[key]}</span>{" "}
                  <span className="block text-[11px] font-normal">{SIZE_HINTS[key]}</span>
                </Segment>
              ))}
            </div>
          </Group>

          <Group title="Location">
            <div className="grid grid-cols-3 gap-1.5">
              {keysOf<CardLocation>(CARD_LOCATIONS).map((key) => (
                <Choice key={key} pressed={card.location === key} onClick={() => edit({ location: key })} className="flex flex-col items-center justify-center gap-1.5 p-2">
                  <span aria-hidden="true" className="relative box-border h-10 w-[30px] rounded-xs border border-[#A89F92] bg-white">
                    <span className="absolute inset-x-[3px] top-[3px] h-[22px] bg-[#CFC7BC]" />
                    <span className="absolute bg-vermilion-500" style={MARKS[key]} />
                  </span>
                  <span className="text-center text-[11px] leading-tight">{CARD_LOCATIONS[key]}</span>
                </Choice>
              ))}
            </div>
          </Group>

          <Group title="On the card">
            <Check label="Recipe name" checked={card.showName} onChange={(showName) => edit({ showName })} />
            <Check label="Camera settings on the card (f-stop, shutter, ISO)" checked={card.showExif} onChange={(showExif) => edit({ showExif })} />
          </Group>

          <Group title="Preview on">
            <div className={segments}>
              <Segment pressed={dark} onClick={() => setDark(true)}>
                Dark page
              </Segment>
              <Segment pressed={!dark} onClick={() => setDark(false)}>
                Light page
              </Segment>
            </div>
          </Group>
        </>
      }
      footer={
        <>
          <SaveError style={style} />
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-ink-900 text-[15px] font-semibold text-paper-50 transition hover:bg-ink-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to style
          </button>
          <p aria-live="polite" className="min-h-4 text-xs text-ink-500">
            {savedMessage(style)}
          </p>
        </>
      }
      asideLabel="Preview"
      aside={
        <div className="flex flex-col items-center gap-4">
          {look.recipeCards ? null : (
            <p className="text-center text-[13px] text-ink-700">
              Recipe cards are off, so none will print.{" "}
              <button type="button" onClick={() => style.edit({ recipeCards: true })} className="font-medium text-vermilion-600 underline underline-offset-2">
                Turn them on
              </button>
            </p>
          )}
          {page ? (
            <div className="max-[479px]:zoom-[0.7]">
              <PdfPagePreview settings={shown} zine={own ? zine : { ...zine, pages: [page, ...zine.pages.slice(1)] }} page={page} label="Photo page with its recipe card" width={CARD_PREVIEW_WIDTH} />
            </div>
          ) : (
            <p className="text-sm text-ink-700">Add a page and save to see a preview.</p>
          )}
          <p role="status" className="max-w-[460px] text-center text-[13px] text-[#8A2E12]">
            {hidesPhoto ? "A full recipe on top of the photo hides a lot of it. Below the photo works better at this size." : null}
          </p>
          {page && !own ? <p className="text-center text-[13px] text-ink-700">No photo in this zine has a recipe on its card, so this is a sample.</p> : null}
          {page ? <p className="text-[13px] text-ink-700">Photo page at about half {PAPERS[shown.paper].label} size</p> : null}
        </div>
      }
    />
  );
}
