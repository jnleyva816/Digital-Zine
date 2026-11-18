import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** No landing page in the MVP: send creators to their board, everyone else to sign in. */
export default async function RootPage() {
  const session = await auth();
  redirect(session?.user?.id ? "/board" : "/signin");
}
