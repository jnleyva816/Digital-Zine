import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { migrateToBoards } from "../src/lib/board-migration";

// npm scripts, Vitest, and Playwright all run from the repository root.
const ROOT = process.cwd();

/** Values from `.env.test`. They override anything inherited from the shell or `.env`. */
export function loadTestEnv(): Record<string, string> {
  const parsed = parseEnv(readFileSync(path.join(ROOT, ".env.test"), "utf8"));
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function assertTestDatabase(url: string | undefined): string {
  const name = url ? new URL(url).pathname.replace(/^\//, "") : "";
  if (!url || !name.endsWith("_test")) {
    throw new Error(`Refusing to reset database "${name || "(unset)"}": test databases must end in "_test".`);
  }
  return url;
}

/**
 * Bring the test database to a known state: apply the schema, empty every
 * table, and run the normal seed. Never runs against a non-`_test` database.
 */
export async function resetTestDatabase(): Promise<void> {
  const env = { ...process.env, ...loadTestEnv() };
  const url = assertTestDatabase(env.DATABASE_URL);
  const run = (args: string[]) => {
    try {
      execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", args, { cwd: ROOT, env, stdio: "pipe" });
    } catch (err) {
      const e = err as { stdout?: Buffer; stderr?: Buffer };
      throw new Error(
        `Test database setup failed: npx ${args.join(" ")}\n${e.stderr?.toString() ?? ""}${e.stdout?.toString() ?? ""}`
      );
    }
  };

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    // Data steps `db push` cannot do on its own must run before it (DIG-25).
    await migrateToBoards(prisma);
    run(["prisma", "db", "push", "--skip-generate"]);

    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length > 0) {
      const list = tables.map((t) => `"public"."${t.tablename.replace(/"/g, '""')}"`).join(", ");
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }

  run(["tsx", "prisma/seed.ts"]);
}
