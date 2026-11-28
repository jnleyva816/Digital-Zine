/** The URL fragment that names a page of a zine (DIG-49), so a shared link opens that photo. */
export const pageHash = (page: number): string => `#page-${page}`;

/** The page a fragment names, or null when it is not a page of this zine. */
export function parsePageHash(hash: string, total: number): number | null {
  const match = /^#page-(\d+)$/.exec(hash);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isInteger(page) && page >= 1 && page <= total ? page : null;
}
