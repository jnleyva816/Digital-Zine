/**
 * Creator handles (DIG-111): the `<handle>` in `/u/<handle>`. Stored lowercase, so they are
 * case-insensitive. Only ASCII letters, digits, and inner underscores, so no two handles can look
 * alike (no Cyrillic "і" for "i", no ligatures). Client-safe: no database access here.
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

const HANDLE_PATTERN = new RegExp(`^[a-z0-9](?:[a-z0-9_]{${HANDLE_MIN - 2},${HANDLE_MAX - 2}})[a-z0-9]$`);

/**
 * Words nobody may take: every top-level route (a test checks `src/app` against this list), routes
 * we are likely to add, and names that would pass for the service or its staff.
 */
const RESERVED = new Set([
  // Top-level routes today. Dashes become underscores, since handles cannot hold a dash.
  "account", "admin", "api", "billing", "board", "boards", "editor", "forgot_password", "help",
  "privacy", "recipes", "reset_password", "signin", "signup", "terms", "u", "verify_email", "z",
  "favicon", "icon", "manifest", "robots", "sitemap", "llms", "opengraph_image", "twitter_image",
  "well_known",
  // Routes we may add.
  "about", "blog", "contact", "discover", "docs", "explore", "feed", "following", "followers",
  "home", "legal", "login", "logout", "new", "notifications", "popular", "pricing", "profile",
  "search", "security", "settings", "share", "signout", "status", "support", "trending", "upgrade",
  "user", "users", "zine", "zines", "static", "assets", "media", "public", "print",
  // The service, and names that would pass for staff.
  "folio", "foliozine", "folio_zine", "digitalzine", "digital_zine", "official", "team", "staff",
  "administrator", "moderator", "mod", "mods", "root", "system", "sysadmin", "owner", "abuse",
  "postmaster", "webmaster", "hostmaster", "noreply", "no_reply", "billing_team",
  // Words that read as nobody, or everybody.
  "me", "you", "null", "undefined", "anonymous", "everyone", "here", "nobody", "test",
]);

export type HandleCheck =
  | { ok: true; handle: string }
  | { ok: false; code: "handle_invalid" | "handle_reserved"; error: string };

/** What a handle is compared and stored as: trimmed, without a leading @, lowercase. */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export function isReservedHandle(handle: string): boolean {
  return RESERVED.has(normalizeHandle(handle));
}

/** Whether a handle may be used, and its stored form. Does not check whether someone has it. */
export function checkHandle(input: unknown): HandleCheck {
  if (typeof input !== "string") return invalid();
  const handle = normalizeHandle(input);
  if (!HANDLE_PATTERN.test(handle)) return invalid();
  if (RESERVED.has(handle)) return { ok: false, code: "handle_reserved", error: "That handle is reserved. Try another." };
  return { ok: true, handle };
}

function invalid(): HandleCheck {
  return {
    ok: false,
    code: "handle_invalid",
    error: `Use ${HANDLE_MIN} to ${HANDLE_MAX} letters, numbers, or underscores, starting and ending with a letter or number.`,
  };
}

/** A profile's address. */
export const profilePath = (handle: string): string => `/u/${handle}`;
