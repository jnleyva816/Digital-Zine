import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./scripts/test-db";

const port = Number(process.env.E2E_PORT ?? 3417);
const baseURL = `http://localhost:${port}`;
// A local stand-in for Resend, started by tests/e2e/signup.spec.ts (DIG-94).
const mailPort = port + 100;
const testEnv: Record<string, string> = {
  ...loadTestEnv(),
  NEXT_PUBLIC_APP_URL: baseURL,
  // The test server enforces the Content Security Policy, so a page that needs something it forbids
  // fails in the browser tests, not in production (DIG-104).
  CSP_MODE: "enforce",
  RESEND_API_KEY: "re_e2e_key",
  RESEND_API_URL: `http://127.0.0.1:${mailPort}/emails`,
  // Fake Google client so the buttons show. Nothing signs in with it: Google is never reached.
  AUTH_GOOGLE_ID: "e2e-google-client-id.apps.googleusercontent.com",
  AUTH_GOOGLE_SECRET: "e2e-google-client-secret",
  // The tests run a production server with the committed test secret (DIG-42).
  ALLOW_TEST_AUTH_SECRET: "1",
  // When Playwright builds the app itself, keep the output away from `.next`, which `next dev` uses.
  ...(process.env.E2E_SKIP_BUILD ? {} : { NEXT_DIST_DIR: ".next-e2e" }),
};

// CI builds in an earlier step; locally, build first so tests never run against stale output.
const start = `npx next start -p ${port}`;
const command = process.env.E2E_SKIP_BUILD ? start : `npx next build && ${start}`;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        // NixOS has no Playwright-managed browser; point at a system Chromium instead.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: {
    command,
    url: `${baseURL}/signin`,
    // Never attach to some other process that happens to own the port.
    reuseExistingServer: false,
    timeout: 240_000,
    env: testEnv,
    stdout: "pipe",
    stderr: "pipe",
  },
});
