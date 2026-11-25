import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { MAX_UPLOAD_BYTES } from "./src/lib/limits";

const nextConfig: NextConfig = {
  // Playwright builds into its own folder so test runs never clobber a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Do not announce the stack (DIG-104).
  poweredByHeader: false,
  experimental: {
    // Next cuts off request bodies past 10 MB on routes behind middleware, which includes local
    // uploads (DIG-120). Just above our own limit, so the route still sees and refuses a larger file.
    middlewareClientMaxBodySize: MAX_UPLOAD_BYTES + 1024 * 1024,
  },
  serverExternalPackages: ["@react-pdf/renderer", "sharp", "pg-boss"],
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    // Match the stored AVIF widths (DIG-26, `VARIANT_WIDTHS`), so a phone asks for the 480 px copy
    // instead of Next's default smallest of 640 px. Wider requests get the full-resolution copy.
    deviceSizes: [480, 960, 1600, 3840],
    // No remotePatterns: the custom loader returns stored URLs directly, so Next's optimizer never
    // fetches anything. Allowing any host would only matter if the loader were switched off, and
    // then it would let anyone use the server to fetch images from any site (DIG-46).
  },
};

// Sentry (DIG-20). Source maps upload only when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are
// set at build time; without them the build is unchanged apart from the SDK.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
});
