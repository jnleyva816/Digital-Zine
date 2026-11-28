/**
 * Sentry settings shared by the server and the browser (DIG-20). Without a DSN nothing is sent, so
 * dev, tests and CI never report. Personal data stays out: no cookies, IPs or user details
 * (`sendDefaultPii: false`), no performance traces and no session replays.
 */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  };
}
