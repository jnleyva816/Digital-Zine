// DIG-111 checkpoint stub: tests/api/public-profile.test.ts is written and red; implement here next.
export type PublicProfileResult = { kind: "redirect"; handle: string } | { kind: "profile"; profile: { handle: string; name: string | null; bio: string | null; zines: { title: string; path: string; pageCount: number; cover: { imageUrl: string } | null }[] } } | null;

export async function getPublicProfile(_handle: string): Promise<PublicProfileResult> {
  return null;
}
