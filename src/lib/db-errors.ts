import { Prisma } from "@prisma/client";

/**
 * True when Prisma refused a write because it would break a unique constraint (P2002), on `field`
 * if one is given (DIG-45). Concurrent requests can both pass an "is it free?" check; the
 * constraint is the real guard, and this turns its error into a clear response instead of a 500.
 */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!field) return true;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) ? target.includes(field) : typeof target === "string" ? target.includes(field) : true;
}
