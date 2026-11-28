import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/db-errors";
import { revalidatePublicZines } from "@/lib/public-zine-cache";
import { HANDLES_PER_ACCOUNT, type ProfileInput } from "@/lib/profile-rules";

/** What a creator sees of their own profile. Never the email. */
export interface OwnProfile {
  handle: string | null;
  name: string | null;
  bio: string | null;
}

export type ProfileUpdateResult =
  | { ok: true; profile: OwnProfile }
  | { ok: false; status: 409; code: "handle_taken" | "handle_limit"; error: string };

class HandleRefused extends Error {
  constructor(readonly code: "handle_taken" | "handle_limit") {
    super(code);
  }
}

const TAKEN = { ok: false, status: 409, code: "handle_taken", error: "That handle is taken. Try another." } as const;
const LIMIT = {
  ok: false,
  status: 409,
  code: "handle_limit",
  error: `You've changed your handle ${HANDLES_PER_ACCOUNT - 1} times, the most allowed. You can switch back to an earlier one, or contact support.`,
} as const;

/**
 * Changes a creator's handle, name, or bio (DIG-111). Claiming a handle inserts it into
 * `UserHandle`, whose key is the handle, so two accounts can never both get one; the loser gets
 * `handle_taken`. A per-account lock keeps the 5-handle limit exact under concurrent renames.
 * Refreshes the creator's published zine pages, whose byline shows the name and links the handle.
 */
export async function updateProfile(userId: string, input: ProfileInput): Promise<ProfileUpdateResult> {
  let profile: OwnProfile;
  try {
    profile = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`profile:${userId}`}))`;
      if (input.handle !== undefined) {
        const existing = await tx.userHandle.findUnique({ where: { handle: input.handle }, select: { userId: true } });
        if (existing && existing.userId !== userId) throw new HandleRefused("handle_taken");
        if (!existing) {
          if ((await tx.userHandle.count({ where: { userId } })) >= HANDLES_PER_ACCOUNT) throw new HandleRefused("handle_limit");
          await tx.userHandle.create({ data: { handle: input.handle, userId } });
        }
      }
      return tx.user.update({
        where: { id: userId },
        data: { handle: input.handle, name: input.name, bio: input.bio },
        select: { handle: true, name: true, bio: true },
      });
    });
  } catch (error) {
    if (error instanceof HandleRefused) return error.code === "handle_taken" ? TAKEN : LIMIT;
    // Another account inserted the same handle between our check and our insert.
    if (isUniqueViolation(error)) return TAKEN;
    throw error;
  }

  if (input.handle !== undefined || input.name !== undefined) {
    const zines = await prisma.zine.findMany({
      where: { ownerId: userId, published: true },
      select: { slug: true, owner: { select: { publicId: true } } },
    });
    await revalidatePublicZines(zines.map((z) => ({ owner: z.owner.publicId, slug: z.slug })));
  }
  return { ok: true, profile };
}
