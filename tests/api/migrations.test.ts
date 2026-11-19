import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkExistingDatabase, checkMigrations } from "../../scripts/migration-check";

/**
 * DIG-19: production schema changes ship as Prisma migrations. These run the real Prisma CLI
 * against throwaway `_test` databases, so they take a few seconds.
 */
describe("Prisma migrations (DIG-19)", () => {
  it("build a fresh database that matches schema.prisma exactly", async () => {
    const result = await checkMigrations();
    expect(result.output).toContain("20261119000000_baseline");
    expect(result.output).toContain("All migrations have been successfully applied.");
    expect(result.ok, result.output).toBe(true);
  }, 120_000);

  it("adopt a database that was set up with db push: the baseline is marked applied and nothing else changes", async () => {
    const result = await checkExistingDatabase();
    expect(result.output).toContain("No pending migrations to apply");
    expect(result.ok, result.output).toBe(true);
  }, 120_000);

  it("fail when schema.prisma changes without a migration, which is what CI guards against", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-schema-"));
    const drifted = path.join(dir, "schema.prisma");
    const schema = await fs.readFile("prisma/schema.prisma", "utf8");
    await fs.writeFile(drifted, schema.replace("model RateLimit {", "model RateLimit {\n  note String?"));
    try {
      const result = await checkMigrations(drifted);
      expect(result.ok).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
