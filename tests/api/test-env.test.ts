import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertTestDatabase, loadTestEnv } from "../../scripts/test-db";

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

// Every test run resets its database, so a URL that points anywhere but a `_test` database must
// stop the run before anything is written (DIG-123).
describe("assertTestDatabase", () => {
  it("accepts a database whose name ends in _test, including a worktree's own", () => {
    for (const url of [
      "postgresql://zine:zine@127.0.0.1:5432/digital_zine_test?schema=public",
      "postgresql://zine:zine@127.0.0.1:5432/digital_zine_dig123_test?schema=public",
    ]) {
      expect(assertTestDatabase(url)).toBe(url);
    }
  });

  it.each([
    ["the dev database", "postgresql://zine:zine@127.0.0.1:5432/digital_zine?schema=public", "digital_zine"],
    ["a name with _test in the middle", "postgresql://h/digital_zine_test_copy", "digital_zine_test_copy"],
    ["no database name", "postgresql://h:5432/", ""],
  ])("refuses %s", (_label, url, name) => {
    expect(() => assertTestDatabase(url)).toThrow(
      `Refusing to reset database "${name || "(unset)"}": test databases must end in "_test".`
    );
  });

  it("refuses when DATABASE_URL is unset", () => {
    expect(() => assertTestDatabase(undefined)).toThrow('Refusing to reset database "(unset)"');
  });
});
