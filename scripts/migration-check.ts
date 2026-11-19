import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { loadTestEnv } from "./test-db";

const run = promisify(execFile);
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

/** The migration that matches the schema as it stood when migrations began (DIG-19). */
export const BASELINE_MIGRATION = "20261119000000_baseline";

/**
 * A throwaway database next to the test database, for proving migrations. Names end in `_test`,
 * so nothing here can touch the dev or production database.
 */
async function withScratchDatabase(name: string, fn: (url: string) => Promise<string>): Promise<{ ok: boolean; output: string }> {
  if (!name.endsWith("_test")) throw new Error(`Refusing to use database "${name}": it must end in "_test".`);
  const base = new URL(process.env.CHECK_DATABASE_URL ?? loadTestEnv().DATABASE_URL);
  const scratch = new URL(base);
  scratch.pathname = `/${name}`;
  const admin = new PrismaClient({ datasourceUrl: base.toString() });
  const recreate = async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  };
  try {
    await recreate();
    const output = await fn(scratch.toString());
    return { ok: true, output };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}${e.message ?? ""}` };
  } finally {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => undefined);
    await admin.$disconnect();
  }
}

async function prisma(url: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await run(NPX, ["prisma", ...args], {
    env: { ...process.env, DATABASE_URL: url },
    maxBuffer: 10 * 1024 * 1024,
  });
  return `${stdout}${stderr}`;
}

const SCHEMA = "prisma/schema.prisma";

/** Exits non-zero (and so throws) when the database differs from the schema file. */
const assertMatchesSchema = (url: string, schemaPath = SCHEMA) =>
  prisma(url, ["migrate", "diff", "--from-url", url, "--to-schema-datamodel", schemaPath, "--exit-code"]);

/**
 * Applies every migration to a fresh database and checks the result matches `schema.prisma`.
 * This is what a new production database goes through.
 */
export function checkMigrations(schemaPath = SCHEMA) {
  return withScratchDatabase("digital_zine_migrations_test", async (url) => {
    const deployed = await prisma(url, ["migrate", "deploy"]);
    await assertMatchesSchema(url, schemaPath);
    return `${deployed}\nSchema matches the migrations.`;
  });
}

/**
 * A database set up with `db push` before migrations existed (like the owner's dev database):
 * mark the baseline as applied, then `migrate deploy` must find nothing to do and leave a
 * database that still matches `schema.prisma`.
 */
export function checkExistingDatabase() {
  return withScratchDatabase("digital_zine_pushed_test", async (url) => {
    await prisma(url, ["db", "push", "--skip-generate"]);
    await prisma(url, ["migrate", "resolve", "--applied", BASELINE_MIGRATION]);
    const deployed = await prisma(url, ["migrate", "deploy"]);
    await assertMatchesSchema(url);
    return `${deployed}\nSchema matches the migrations.`;
  });
}
