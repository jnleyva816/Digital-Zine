"use client";

import type { ReactNode } from "react";
import { COVERS, type CoverStyle } from "@/lib/pdf-settings";
import { WebPhoto, nameOf, onePerPhoto, type PreviewZine } from "./PdfPagePreview";
import { Choice, Group } from "./pdf-panel-ui";
import type { PdfStyle } from "./usePdfStyle";

const bar = "block rounded-sm bg-ink-900";
const tone = "bg-[#CFC7BC]";
const PICTURES: Record<CoverStyle, ReactNode> = {
  title: (
    <span className="flex h-full flex-col justify-center gap-1 px-1.5">
      <span className={`${bar} h-1.5 w-full`} />
      <span className={`${bar} h-1.5 w-2/3`} />
    </span>
  ),
  template: (
    <span className="flex h-full flex-col gap-1">
      <span className={`block h-8 ${tone}`} />
      <span className={`${bar} mx-1.5 h-1 w-1/2`} />
    </span>
  ),
  full: (
    <span className={`flex h-full flex-col justify-end ${tone}`}>
      <span className="block bg-white px-1.5 py-1">
        <span className={`${bar} h-1 w-2/3`} />
      </span>
    </span>
  ),
  grid: (
    <span className="flex h-full flex-col gap-1">
      <span className="grid h-8 grid-cols-2 gap-0.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={tone} />
        ))}
      </span>
      <span className={`${bar} mx-1.5 h-1 w-1/2`} />
    </span>
  ),
};

/** What the cover shows, and which photo where it shows one (DIG-126). */
export function CoverOptions({ style, zine }: { style: PdfStyle; zine: PreviewZine }) {
  const { look } = style;
  const cover = look?.cover;
  const photos = onePerPhoto(zine.pages);
  const chosen = photos.find((p) => p.assetId === cover?.photo) ?? photos[0];
  const takesPhoto = cover?.style === "template" || cover?.style === "full";
  return (
    <>
      <Group title="Cover" hint={cover?.style === "grid" ? "The first four photos." : undefined}>
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(COVERS) as CoverStyle[]).map((key) => (
            <Choice
              key={key}
              pressed={cover?.style === key}
              disabled={!look}
              onClick={() => cover && style.edit({ cover: { ...cover, style: key } })}
              className="flex flex-col items-center gap-1.5 px-1 py-2"
            >
              <span aria-hidden="true" className="block h-12 w-9 overflow-hidden border border-[#A89F92] bg-white">
                {PICTURES[key]}
              </span>
              <span className="text-center text-[11px] leading-tight text-ink-700">{COVERS[key]}</span>
            </Choice>
          ))}
        </div>
      </Group>
      {cover && takesPhoto && photos.length > 0 ? (
        <Group title="Cover photo">
          <div className="grid max-h-44 grid-cols-5 gap-1.5 overflow-y-auto p-1">
            {photos.map((page) => {
              const pressed = page === chosen;
              return (
                <button
                  key={page.assetId}
                  type="button"
                  aria-pressed={pressed}
                  aria-label={nameOf(page)}
                  onClick={() => style.edit({ cover: { ...cover, photo: page.assetId } })}
                  className={`relative h-16 overflow-hidden rounded-md bg-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500 ${
                    pressed ? "ring-2 ring-ink-900 ring-offset-2 ring-offset-paper-50" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  <WebPhoto photo={page.photo} fit="cover" sizes="70px" />
                </button>
              );
            })}
          </div>
        </Group>
      ) : null}
    </>
  );
}
