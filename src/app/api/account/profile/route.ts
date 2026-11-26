import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { limitRequest } from "@/lib/rate-limit";
import { parseProfileInput } from "@/lib/profile-rules";
import { updateProfile } from "@/lib/profile";

/** The signed-in creator changes their handle, display name, or bio (DIG-111). */
export async function PATCH(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in to change your profile.", code: "unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That change is not valid.", code: "invalid_request" }, { status: 400 });
  }
  const parsed = parseProfileInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: 400 });

  const result = await updateProfile(user.id, parsed.input);
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  return NextResponse.json({ profile: result.profile }, { headers: { "Cache-Control": "private, no-store" } });
}
