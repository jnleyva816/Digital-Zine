import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Auth gate outside the loading boundary, so signed-out visitors get a real redirect. */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=%2Fbilling");
  }
  return children;
}
