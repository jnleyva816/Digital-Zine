import path from "node:path";

/** Characters a storage key segment may never contain: path separators, NUL, other controls. */
const FORBIDDEN = /[\\\u0000-\u001f\u007f]/;

/**
 * Whether `key` is well formed (DIG-35): plain segments with no `.`, `..`, or empty segments, no
 * leading slash, no backslashes, %-escapes, or control characters, and unchanged by path
 * normalization. Refuse anything else with 400, before any storage call.
 */
export function isWellFormedStorageKey(key: unknown): key is string {
  if (typeof key !== "string" || key.length === 0 || key.length > 500) return false;
  if (key.startsWith("/") || FORBIDDEN.test(key) || /%[0-9a-f]{2}/i.test(key)) return false;
  if (key.split("/").some((s) => s === "" || s === "." || s === "..")) return false;
  return path.posix.normalize(key) === key;
}

/**
 * Whether `key` is a well-formed storage key inside this user's folder, `users/<userId>/`. The
 * ownership check runs on the normalized key, so a key that only looks like it is inside the
 * folder can never pass, even if the segment checks change.
 */
export function isValidStorageKey(userId: string, key: unknown): key is string {
  if (!isWellFormedStorageKey(key)) return false;
  const normalized = path.posix.normalize(key);
  return normalized.startsWith(`users/${userId}/`) && normalized.split("/").length >= 3;
}
