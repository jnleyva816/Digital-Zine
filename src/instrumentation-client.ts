import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

// Browser errors go to Sentry when NEXT_PUBLIC_SENTRY_DSN is set at build time (DIG-20).
Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));
