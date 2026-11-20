import { toBoardAsset, type BoardAsset } from "./types";

/** A board photo for component tests. */
export function boardAsset(id: string, overrides: Partial<BoardAsset> = {}): BoardAsset {
  return { ...toBoardAsset({ id, publicUrl: `/api/media/${id}/full.avif`, kind: "photo", originalName: `${id}.jpg` }), ...overrides };
}

/** A JSON response, as the API sends. */
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
