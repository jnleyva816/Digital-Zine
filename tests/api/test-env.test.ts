import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadTestEnv } from "../../scripts/test-db";

// Each worktree points tests at its own database and port through a gitignored
// `.env.test.local`, instead of editing the committed `.env.test` (DIG-144).
describe("loadTestEnv", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function setup(base: string, local?: string) {
    dir = mkdtempSync(path.join(tmpdir(), "test-env-"));
    writeFileSync(path.join(dir, ".env.test"), base);
    if (local !== undefined) writeFileSync(path.join(dir, ".env.test.local"), local);
    return dir;
  }

  it("reads .env.test", () => {
    const env = loadTestEnv(setup('DATABASE_URL="postgresql://x/digital_zine_test"\nAUTH_SECRET="s"\n'));
    expect(env).toEqual({ DATABASE_URL: "postgresql://x/digital_zine_test", AUTH_SECRET: "s" });
  });

  it("lets .env.test.local override and extend .env.test", () => {
    const env = loadTestEnv(
      setup(
        'DATABASE_URL="postgresql://x/digital_zine_test"\nAUTH_SECRET="s"\n',
        'DATABASE_URL="postgresql://x/digital_zine_dig144_test"\nE2E_PORT="4101"\n'
      )
    );
    expect(env).toEqual({
      DATABASE_URL: "postgresql://x/digital_zine_dig144_test",
      AUTH_SECRET: "s",
      E2E_PORT: "4101",
    });
  });
});
