import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Ownership check for /boards/[id] (DIG-25). It runs outside this segment's `loading.tsx`
 * boundary so a missing or foreign board returns a real 404.
 */
export default async function BoardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, auth()]);
  const owned = session?.user?.id
    ? await prisma.board.findFirst({ where: { id, ownerId: session.user.id }, select: { id: true } })
    : null;
  if (!owned) notFound();
  return children;
}
