import { prisma } from "../src/lib/prisma";
import { stripLegacyOriginals } from "../src/lib/media/legacy-originals";

/**
 * DIG-38: removes EXIF (GPS included) from photos uploaded before the image pipeline.
 *   npx tsx scripts/strip-legacy-metadata.ts --dry-run   # count them
 *   npx tsx scripts/strip-legacy-metadata.ts             # clean them
 */
const dryRun = process.argv.includes("--dry-run");
stripLegacyOriginals({ dryRun })
  .then(({ cleaned }) => console.log(dryRun ? `${cleaned} photo(s) would be cleaned.` : `Cleaned ${cleaned} photo(s).`))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
