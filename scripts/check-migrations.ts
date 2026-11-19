import { checkExistingDatabase, checkMigrations } from "./migration-check";

/**
 * DIG-19: proves the migrations build a database that matches prisma/schema.prisma, both from
 * scratch and on a database first set up with `db push`. CI runs this; run it locally after
 * changing the schema:  npm run db:check-migrations
 */
async function main() {
  for (const [label, check] of [
    ["Fresh database", checkMigrations],
    ["Database set up with db push", checkExistingDatabase],
  ] as const) {
    const { ok, output } = await check();
    console.log(`${ok ? "✓" : "✗"} ${label}`);
    if (!ok) {
      console.error(output);
      console.error("\nschema.prisma and prisma/migrations disagree. Create a migration: npm run db:migrate -- --name <change>");
      process.exitCode = 1;
      return;
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
