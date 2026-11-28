import * as Sentry from "@sentry/nextjs";
import { assertSafeAuthSecret } from "./lib/env";
import { sentryOptions } from "./lib/infra/sentry-options";

/**
 * Runs once when the Next.js server starts. The media worker (DIG-26) is Node-only (sharp, pg),
 * so it lives in instrumentation-node.ts and is imported only inside the NEXT_RUNTIME check, which
 * Next replaces at build time. That keeps sharp out of the edge bundle.
 */
export async function register() {
  // Never serve requests with a missing or published AUTH_SECRET (DIG-42).
  assertSafeAuthSecret();
  // Server errors go to Sentry when SENTRY_DSN is set (DIG-20).
  Sentry.init(sentryOptions(process.env.SENTRY_DSN));
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

/** Reports errors thrown while rendering or in route handlers (DIG-20). */
export const onRequestError = Sentry.captureRequestError;
