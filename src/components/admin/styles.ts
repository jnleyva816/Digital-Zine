/** Shared look for the admin panel (DIG-136 to DIG-139), in the studio's style. */
export const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500";
export const primary = `min-h-11 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-paper-50 shadow-sm hover:bg-ink-800 disabled:opacity-50 ${focusRing}`;
export const secondary = `min-h-11 rounded-xl border border-paper-300 bg-white px-4 py-2 text-sm font-semibold text-ink-800 shadow-sm hover:bg-paper-100 disabled:opacity-50 ${focusRing}`;
export const badge = "rounded-full border border-paper-300 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-700";
export const OFFLINE = "Could not reach the server. Check your connection and try again.";
/** A fixed time zone, so the server and the browser write the same day. */
export const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
export const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
