import path from "node:path";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// `.env.test`, then the gitignored `.env.test.local` (a worktree's own database), win over `.env`,
// so tests never see the dev database.
const env = loadEnv("test", process.cwd(), "");

const shared = {
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
};

// Two projects (DIG-123): `fast` needs no database and runs files in parallel; `api` resets the
// test database once and runs its files one at a time, because they share it.
export default defineConfig({
  ...shared,
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "fast",
          env,
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup/vitest.setup.ts"],
          restoreMocks: true,
        },
      },
      {
        ...shared,
        test: {
          name: "api",
          env,
          environment: "node",
          include: ["tests/api/**/*.test.ts"],
          setupFiles: ["tests/setup/vitest.setup.ts"],
          globalSetup: ["tests/setup/vitest.global-setup.ts"],
          fileParallelism: false,
          restoreMocks: true,
        },
      },
    ],
  },
});
