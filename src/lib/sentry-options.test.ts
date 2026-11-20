import { describe, expect, it } from "vitest";
import { sentryOptions } from "./sentry-options";

describe("sentryOptions (DIG-20)", () => {
  it("is off without a DSN, so dev, tests and CI report nothing", () => {
    expect(sentryOptions(undefined).enabled).toBe(false);
    expect(sentryOptions("").enabled).toBe(false);
  });

  it("reports to the DSN when one is set", () => {
    const options = sentryOptions("https://key@o1.ingest.sentry.io/2");
    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe("https://key@o1.ingest.sentry.io/2");
  });

  it("never sends cookies, IPs or user details, and records no traces or replays", () => {
    const options = sentryOptions("https://key@o1.ingest.sentry.io/2");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
  });
});
