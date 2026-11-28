import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DIG-146: a worktree sets its e2e port only in `.env.test.local`. The mail sink must listen where
// the app sends mail (port + 100), so it has to read the port the same way the Playwright config does.
// Each test loads the modules fresh from a folder that stands in for the worktree.
describe("e2e ports", () => {
  const cwd = process.cwd();
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "e2e-ports-"));
    writeFileSync(path.join(dir, ".env.test"), 'DATABASE_URL="postgresql://x/digital_zine_test"\n');
    writeFileSync(path.join(dir, ".env.test.local"), 'E2E_PORT="4101"\n');
    process.chdir(dir);
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("the mail sink follows the port in .env.test.local when nothing is exported", async () => {
    vi.stubEnv("E2E_PORT", undefined);
    const { MAIL_PORT } = await import("../e2e/mail-sink");
    expect(MAIL_PORT).toBe(4201);
  });

  it("an exported E2E_PORT wins over .env.test.local", async () => {
    vi.stubEnv("E2E_PORT", "3418");
    const { MAIL_PORT } = await import("../e2e/mail-sink");
    expect(MAIL_PORT).toBe(3518);
  });

  it("falls back to 3417 when neither sets a port", async () => {
    vi.stubEnv("E2E_PORT", undefined);
    rmSync(path.join(dir, ".env.test.local"));
    const { e2ePorts } = await import("../../scripts/test-db");
    expect(e2ePorts()).toEqual({ port: 3417, mailPort: 3517 });
  });
});
