import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./scripts/test-db";

const port = Number(process.env.E2E_PORT ?? 3417);
const baseURL = `http://localhost:${port}`;
const testEnv: Record<string, string> = {
  ...loadTestEnv(),
  NEXT_PUBLIC_APP_URL: baseURL,
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
