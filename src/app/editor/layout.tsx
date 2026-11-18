import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Auth gate for /editor/*, outside every loading boundary so redirects are real HTTP 307s. */
export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=%2Feditor");
  }
  return children;
}
