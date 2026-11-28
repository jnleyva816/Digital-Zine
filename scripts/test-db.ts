import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { migrateToBoards } from "../src/lib/board-migration";

// npm scripts, Vitest, and Playwright all run from the repository root.
const ROOT = process.cwd();

/**
 * Values from `.env.test`, then from the gitignored `.env.test.local` when it exists. A worktree
 * uses the local file for its own database and port (`scripts/worktree-new.sh`, DIG-144). They
 * override anything inherited from the shell or `.env`.
 */
export function loadTestEnv(root: string = ROOT): Record<string, string> {
  const read = (file: string) => {
    const full = path.join(root, file);
    return existsSync(full) ? parseEnv(readFileSync(full, "utf8")) : {};
  };
  const parsed = { ...read(".env.test"), ...read(".env.test.local") };
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

/**
 * The e2e server's port: an exported `E2E_PORT`, then the one in `.env.test.local` (a worktree's,
 * DIG-144), then 3417. The mail sink listens on port + 100. The Playwright config and the mail sink
 * both use this, so the app always sends mail where the sink listens (DIG-146).
 */
export function e2ePorts(): { port: number; mailPort: number } {
  const port = Number(process.env.E2E_PORT ?? loadTestEnv().E2E_PORT ?? 3417);
  return { port, mailPort: port + 100 };
}

export function assertTestDatabase(url: string | undefined): string {
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
    // Every table is emptied right after, and the name check above guarantees this is a test
    // database, so Prisma's "may lose data" warning (a new unique index) is safe to accept.
    run(["prisma", "db", "push", "--skip-generate", "--accept-data-loss"]);

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
