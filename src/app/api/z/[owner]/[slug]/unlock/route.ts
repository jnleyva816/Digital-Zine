import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicZinePath } from "@/lib/public-zine-path";
import { consumeRateLimit, limitRequest, peekRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/sign-in";
import { checkAccessCode, signUnlock, UNLOCK_MAX_AGE_SECONDS, unlockCookieName } from "@/lib/zine-access";

const unlockSchema = z.object({ code: z.string().trim().min(1).max(512) });

/**
 * A reader enters a private zine's code (DIG-112). Every try counts against the reader's IP (10 in
 * 15 minutes); wrong ones also count against the zine (30 in 15 minutes, from any IP), so guesses
 * spread over many addresses are still capped. A right code sets a signed, HttpOnly cookie that
 * only that zine's page receives, valid for 30 days or until the creator changes the code.
 */
export async function POST(req: Request, context: { params: Promise<{ owner: string; slug: string }> }) {
  const { owner, slug } = await context.params;
  const parsed = unlockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the code." }, { status: 400 });

  const limited = await limitRequest("unlock-ip", clientIp(req));
  if (limited) return limited;

  const zine = await prisma.zine.findFirst({
    where: { slug, published: true, visibility: "private", owner: { publicId: owner, deactivatedAt: null } },
    select: { id: true, slug: true, accessCodeHash: true, accessCodeVersion: true, owner: { select: { publicId: true } } },
  });
  if (!zine?.accessCodeHash) return NextResponse.json({ error: "Zine not found" }, { status: 404 });

  const zineLimit = await peekRateLimit("unlock-zine", zine.id);
  if (!zineLimit.ok) return rateLimitedResponse("unlock-zine", zineLimit.retryAfterSeconds);

  if (!(await checkAccessCode(parsed.data.code, zine.accessCodeHash))) {
    await consumeRateLimit("unlock-zine", zine.id);
    return NextResponse.json({ error: "That code is not right." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(unlockCookieName(zine.id), signUnlock(zine.id, zine.accessCodeVersion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: publicZinePath(zine.owner.publicId, zine.slug),
    maxAge: UNLOCK_MAX_AGE_SECONDS,
  });
  return res;
}
