import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

/**
 * Auth gate for /recipes (DIG-24). Like /board, it sits outside the `loading.tsx` boundary so
 * signed-out visitors get a real HTTP redirect.
 */
export default async function RecipesLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=%2Frecipes");
  }
  return children;
}
