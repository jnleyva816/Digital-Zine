import { resetTestDatabase } from "../../scripts/test-db";

export default async function setup() {
  await resetTestDatabase();
}
