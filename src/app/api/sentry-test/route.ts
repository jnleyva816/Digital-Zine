import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { limitRequest } from "@/lib/rate-limit";

/**
 * DIG-98: throws one error on purpose, so the owner can see it arrive in Sentry. Signed-in
 * creators only, and rate limited. This route is deployed from a branch and never merged to `main`.
 */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  throw new Error("Sentry test error (DIG-98): thrown on purpose to check error reporting.");
}
