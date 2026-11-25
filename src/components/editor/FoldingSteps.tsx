import type { CSSProperties, ReactNode } from "react";

const paper: CSSProperties = { background: "#fff", border: "1px solid #A89F92", boxSizing: "border-box" };
const CREASE = "1.5px dashed #6E655B";

/** Panels of the open sheet, with the front cover tinted. */
const printed = (
  <span style={{ ...paper, width: 156, height: 92, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(2, 1fr)" }}>
    {Array.from({ length: 8 }, (_, i) => (
      <span key={i} style={{ borderRight: i % 4 < 3 ? "1px dashed #CFC7BC" : undefined, borderBottom: i < 4 ? "1px dashed #CFC7BC" : undefined, background: i === 7 ? "#CFC7BC" : undefined }} />
    ))}
  </span>
);

const STEPS: { picture: ReactNode; text: ReactNode }[] = [
  { picture: printed, text: <><b>Print</b> on one sheet, landscape, at actual size.</> },
  { picture: <span style={{ ...paper, width: 156, height: 46, borderBottom: "2px solid #6E655B" }} />, text: <><b>Fold in half</b> the long way, print outside. Unfold.</> },
  {
    picture: (
      <span style={{ ...paper, width: 156, height: 92, display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ borderRight: i < 3 ? CREASE : undefined }} />
        ))}
      </span>
    ),
    text: <><b>Fold into quarters</b> the short way to crease the panels. Unfold.</>,
  },
  {
    picture: (
      <span style={{ ...paper, position: "relative", width: 78, height: 92, borderLeft: "2px solid #6E655B" }}>
        <span style={{ position: "absolute", left: 0, top: 45, width: 39, borderTop: "2px solid #B83D1B" }} />
      </span>
    ),
    text: <><b>Fold in half</b> the short way and <b>cut</b> along the middle crease, from the fold to the centre (the solid line).</>,
  },
  {
    picture: (
      <>
        <span style={{ ...paper, position: "absolute", width: 120, height: 30 }} />
        <span style={{ ...paper, position: "absolute", width: 30, height: 96 }} />
      </>
    ),
    text: <><b>Open it, fold the long way</b>, and push the ends together. The cut opens into a plus shape.</>,
  },
  {
    picture: (
      <span style={{ ...paper, width: 66, height: 100, padding: 6, boxShadow: "3px 3px 0 #CFC7BC", display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ height: 50, background: "#CFC7BC" }} />
        <span style={{ height: 4, width: "80%", background: "#161412" }} />
        <span style={{ height: 3, width: "60%", background: "#A89F92" }} />
      </span>
    ),
    text: <><b>Flatten</b> into a booklet with the cover on the front.</>,
  },
];

/** How a printed mini zine becomes a booklet (DIG-74): in the style panel and on its own page. */
export function FoldingSteps({ labelledBy }: { labelledBy: string }) {
  return (
    <ol aria-labelledby={labelledBy} className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {STEPS.map(({ picture, text }, i) => (
        <li key={i} className="flex flex-col gap-2.5 rounded-xl bg-paper-50 p-3.5 ring-1 ring-paper-200">
          <span aria-hidden="true" className="relative flex h-[110px] items-center justify-center">
            {picture}
          </span>
          <span className="text-[13px] leading-snug text-ink-900">
            <b>{i + 1}.</b> {text}
          </span>
        </li>
      ))}
    </ol>
  );
}
