/** The brand's colors, from the Tailwind palette, for places Tailwind cannot reach: icons, the manifest, share images (DIG-105). */
export const BRAND = {
  paper: "#FDFBF7",
  ink: "#161412",
  vermilion: "#D94E28",
} as const;

/**
 * The mark: a card with a folded corner, which is what a flip card is. Bold shapes only, so it stays
 * legible at 16 px. `rounded` is for tab and app icons; `scale` shrinks the card to leave the safe
 * zone a maskable icon needs, since phones crop those to a circle or squircle.
 */
export function brandMarkSvg({ rounded = true, scale = 1 }: { rounded?: boolean; scale?: number } = {}): string {
  const card = `<rect x="120" y="80" width="272" height="352" rx="22" fill="${BRAND.paper}"/><path d="M392 322V410Q392 432 370 432H282Z" fill="${BRAND.vermilion}"/>`;
  const body = scale === 1 ? card : `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${card}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512"${rounded ? ' rx="112"' : ""} fill="${BRAND.ink}"/>${body}</svg>\n`;
}
