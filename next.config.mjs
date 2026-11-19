/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright builds into its own folder so test runs never clobber a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@react-pdf/renderer", "sharp", "pg-boss"],
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    // Match the stored AVIF widths (DIG-26, `VARIANT_WIDTHS`), so a phone asks for the 480 px copy
    // instead of Next's default smallest of 640 px. Wider requests get the full-resolution copy.
    deviceSizes: [480, 960, 1600, 3840],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
