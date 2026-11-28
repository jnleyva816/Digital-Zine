import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

/** Auth gate, so signed-out visitors get a real redirect (DIG-108). */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?callbackUrl=%2Faccount");
  return children;
}
