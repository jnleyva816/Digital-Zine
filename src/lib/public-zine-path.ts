/**
 * A zine's public address (DIG-102): the creator's short public ID, then the slug. A slug is only
 * unique per creator, so the creator is part of the address. Anything that is not path-safe is
 * encoded, so a slug can never change which route it reaches.
 */
export const publicZinePath = (owner: string, slug: string): string =>
  `/z/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`;
