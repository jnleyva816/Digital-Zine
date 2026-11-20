import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Railway's deploy check and the uptime monitor call this (DIG-20). Never cached.
export const dynamic = "force-dynamic";

const reply = (ok: boolean) =>
  NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });

/** 200 when the app can reach its database, 503 otherwise. The body never says why. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return reply(true);
  } catch (error) {
    console.error("Health check: database unreachable", error);
    return reply(false);
  }
}
