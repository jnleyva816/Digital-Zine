/** Cookie that turns on "View as Free" for an admin. It only ever removes access, never adds it. */
export const VIEW_AS_FREE_COOKIE = "dz_view_as_free";

export interface Access {
  /** The tier every feature check uses. */
  tier: "free" | "pro";
  isAdmin: boolean;
  /** True when an admin has switched to seeing the app as a Free creator. */
  viewingAsFree: boolean;
}

/**
 * What a user can do right now (DIG-17). Admins get Pro without a subscription, unless they are
 * viewing as Free, in which case they get exactly what a Free creator gets. Regular users get
 * their billed tier, and the cookie is ignored for them.
 */
export function effectiveAccess(
  user: { role: "user" | "admin"; tier: "free" | "pro" },
  viewAsFreeCookie: boolean
): Access {
  if (user.role !== "admin") return { tier: user.tier, isAdmin: false, viewingAsFree: false };
  return viewAsFreeCookie
    ? { tier: "free", isAdmin: true, viewingAsFree: true }
    : { tier: "pro", isAdmin: true, viewingAsFree: false };
}
