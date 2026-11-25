import localFont from "next/font/local";

/**
 * The PDF's own font files for the style panel's preview (DIG-71): the same files `src/lib/pdf-fonts.ts`
 * gives react-pdf. Not preloaded: a browser fetches a face only when the preview draws with it.
 */
const fraunces = localFont({
  src: [
    { path: "../../../assets/fonts/fraunces/Fraunces-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../../assets/fonts/fraunces/Fraunces-Italic.ttf", weight: "400", style: "italic" },
  ],
  preload: false,
});
const inter = localFont({
  src: [
    { path: "../../../assets/fonts/inter/Inter-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../assets/fonts/inter/Inter-Medium.ttf", weight: "500", style: "normal" },
  ],
  preload: false,
});
const plexMono = localFont({
  src: [
    { path: "../../../assets/fonts/ibmplexmono/IBMPlexMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../assets/fonts/ibmplexmono/IBMPlexMono-Medium.ttf", weight: "500", style: "normal" },
  ],
  preload: false,
});
const instrumentSerif = localFont({
  src: [
    { path: "../../../assets/fonts/instrumentserif/InstrumentSerif-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../assets/fonts/instrumentserif/InstrumentSerif-Italic.ttf", weight: "400", style: "italic" },
  ],
  preload: false,
});
const dmMono = localFont({ src: "../../../assets/fonts/dmmono/DMMono-Regular.ttf", weight: "400", preload: false });
const spaceGrotesk = localFont({
  src: [
    { path: "../../../assets/fonts/spacegrotesk/SpaceGrotesk-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../assets/fonts/spacegrotesk/SpaceGrotesk-Bold.ttf", weight: "700", style: "normal" },
  ],
  preload: false,
});
const courierPrime = localFont({
  src: [
    { path: "../../../assets/fonts/courierprime/CourierPrime-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../assets/fonts/courierprime/CourierPrime-Bold.ttf", weight: "700", style: "normal" },
  ],
  preload: false,
});
const anton = localFont({ src: "../../../assets/fonts/anton/Anton-Regular.ttf", weight: "400", preload: false });

const FAMILIES: Record<string, string> = {
  Fraunces: fraunces.style.fontFamily,
  Inter: inter.style.fontFamily,
  "IBM Plex Mono": plexMono.style.fontFamily,
  "Instrument Serif": instrumentSerif.style.fontFamily,
  "DM Mono": dmMono.style.fontFamily,
  "Space Grotesk": spaceGrotesk.style.fontFamily,
  "Courier Prime": courierPrime.style.fontFamily,
  Anton: anton.style.fontFamily,
};

/** The CSS family for one of `TYPEFACE_FACES`' families. */
export const webFontFamily = (family: string): string => FAMILIES[family] ?? family;
