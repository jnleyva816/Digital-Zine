import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "./security-headers";

// DIG-104: the headers every response carries, whatever the page.
const header = (name: string) => SECURITY_HEADERS.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;

describe("SECURITY_HEADERS", () => {
  it("tells browsers to use HTTPS for two years, on every subdomain", () => {
    expect(header("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
  });

  it("stops MIME sniffing, framing, and cross-window access", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("sends the origin, and never the path, to other sites", () => {
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("turns off every browser feature the app never uses", () => {
    const policy = header("Permissions-Policy")!;
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb", "bluetooth", "serial", "hid", "midi", "magnetometer", "gyroscope", "accelerometer", "display-capture", "interest-cohort"]) {
      expect(policy, feature).toContain(`${feature}=()`);
    }
  });

  it("does not turn off what the app does use", () => {
    const policy = header("Permissions-Policy")!;
    // The full-screen photo view uses the Fullscreen API's replacement, and clipboard copy may come later.
    expect(policy).not.toContain("fullscreen=()");
    expect(policy).not.toContain("clipboard-write=()");
  });

  it("has each header once, with a non-empty value", () => {
    const keys = SECURITY_HEADERS.map((h) => h.key.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    for (const h of SECURITY_HEADERS) expect(h.value.length).toBeGreaterThan(0);
  });
});
