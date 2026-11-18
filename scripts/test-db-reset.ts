import { resetTestDatabase } from "./test-db";

resetTestDatabase()
  .then(() => console.log("Test database reset and seeded."))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
