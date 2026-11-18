import path from "node:path";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    // `.env.test` wins over `.env`, so tests never see the dev database.
    env: loadEnv("test", process.cwd(), ""),
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/api/**/*.test.ts"],
    setupFiles: ["tests/setup/vitest.setup.ts"],
    globalSetup: ["tests/setup/vitest.global-setup.ts"],
    // API tests share one database; run files one at a time.
    fileParallelism: false,
    restoreMocks: true,
  },
});
