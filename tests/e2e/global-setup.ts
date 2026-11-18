import { resetTestDatabase } from "../../scripts/test-db";

export default async function globalSetup() {
  await resetTestDatabase();
}
