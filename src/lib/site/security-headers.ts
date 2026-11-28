/**
 * The headers every response carries (DIG-104), whatever the page. The Content Security Policy is
 * not here: it needs a fresh nonce per request, so the middleware adds it.
 */

/** Browser features the app never uses, turned off so a script that slips in cannot reach them. */
const DISABLED_FEATURES = [
  "accelerometer",
  "bluetooth",
  "browsing-topics",
  "camera",
  "display-capture",
  "geolocation",
  "gyroscope",
  "hid",
  "interest-cohort",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "serial",
  "usb",
];

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  // Two years of HTTPS only, on every subdomain. Not `preload`: that is a hard-to-undo commitment.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // frame-ancestors in the CSP does this too; the header covers browsers that ignore the CSP.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: DISABLED_FEATURES.map((f) => `${f}=()`).join(", ") },
];
