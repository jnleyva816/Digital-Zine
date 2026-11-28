import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

/**
 * Auth gate for /board. It lives in the layout, outside the `loading.tsx`
 * Suspense boundary, so signed-out visitors get a real HTTP redirect instead
 * of a streamed 200 followed by a client-side redirect.
 */
export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=%2Fboard");
  }
  return children;
}
