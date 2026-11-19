import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Auth gate for /boards (DIG-25). Like /board, it sits outside the `loading.tsx` boundary so
 * signed-out visitors get a real HTTP redirect.
 */
export default async function BoardsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=%2Fboards");
  }
  return children;
}
