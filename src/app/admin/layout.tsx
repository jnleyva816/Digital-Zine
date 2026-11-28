import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/auth";

/**
 * The gate for the admin panel (DIG-136). It sits outside the `loading.tsx` boundary, so signed-out
 * visitors get a real redirect and anyone else a real 404. Each page checks the role again, because
 * a layout does not run on every navigation.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Fadmin");
  if (user.role !== "admin") notFound();
  return children;
}
