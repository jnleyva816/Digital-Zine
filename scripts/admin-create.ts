/**
 * Creates an admin account, or promotes an existing one, in the database named by DATABASE_URL.
 *
 *   npm run admin:create -- --email you@example.com [--name "Your Name"] [--reset]
 *
 * A new account, or --reset, gets a random password that is printed once and never stored in
 * plain text. Promoting an existing account keeps its password unless --reset is given.
 */
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { ensureAdmin } from "../src/lib/admin-account";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      reset: { type: "boolean", default: false },
    },
  });
  if (!values.email) {
    console.error('Usage: npm run admin:create -- --email you@example.com [--name "Your Name"] [--reset]');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const result = await ensureAdmin(prisma, { email: values.email, name: values.name, reset: values.reset });
    const email = values.email.trim().toLowerCase();
    if (result.created) console.log(`Created admin ${email}.`);
    else if (result.promoted) console.log(`Promoted ${email} to admin.`);
    else console.log(`${email} is already an admin.`);

    if (result.password) {
      console.log(`\nPassword (shown once, store it in a password manager):\n\n  ${result.password}\n`);
    } else {
      console.log("Password unchanged. Run again with --reset to set a new one.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
