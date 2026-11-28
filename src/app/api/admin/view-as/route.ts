import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { VIEW_AS_FREE_COOKIE } from "@/lib/billing/entitlements";

const bodySchema = z.object({ viewAsFree: z.boolean() });

/** Admin-only: switch between full access and seeing the app as a Free creator. */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only admins can switch views." }, { status: 403 });

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed?.success) {
    return NextResponse.json({ error: "Send { \"viewAsFree\": true | false }." }, { status: 400 });
  }

  const res = NextResponse.json({ viewAsFree: parsed.data.viewAsFree });
  if (parsed.data.viewAsFree) {
    res.cookies.set(VIEW_AS_FREE_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    res.cookies.set(VIEW_AS_FREE_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  }
  return res;
}
