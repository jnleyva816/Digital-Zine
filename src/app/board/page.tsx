import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getOrCreateDefaultBoard } from "@/lib/boards";
import { withUserLock } from "@/lib/usage";

/** `/board` predates multiple boards (DIG-25); it opens the creator's first board. */
export default async function BoardRedirect() {
  // `layout.tsx` already redirects signed-out visitors; this covers a user deleted mid-session.
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Fboard");

  const board = await withUserLock(user.id, (tx) => getOrCreateDefaultBoard(user.id, tx));
  redirect(`/boards/${board.id}`);
}
