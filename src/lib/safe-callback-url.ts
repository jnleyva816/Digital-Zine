/** Only allow same-origin relative paths so `callbackUrl` cannot redirect off-site. */
export function safeCallbackUrl(raw: string | null | undefined, fallback = "/board"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  return raw;
}
