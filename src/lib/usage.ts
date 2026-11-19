import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

/** Bytes a user stores across all of their boards (DIG-32). The quota is per account (DIG-25). */
export async function getAccountUsageBytes(userId: string, db: Db = prisma): Promise<number> {
  const { _sum } = await db.mediaAsset.aggregate({ where: { ownerId: userId }, _sum: { sizeBytes: true } });
  return _sum.sizeBytes ?? 0;
}

/**
 * Runs `fn` in a transaction that holds a per-user advisory lock, so two requests from the same
 * user cannot both pass a limit check and then both write.
 */
export function withUserLock<T>(userId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user-limits:${userId}`}))`;
    return fn(tx);
  });
}
