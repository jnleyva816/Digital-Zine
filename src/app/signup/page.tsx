import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { googleEnabled } from "@/lib/google-config";
import { AuthCard } from "@/components/AuthCard";
import { SignUpForm } from "@/components/SignUpForm";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a Folio studio to collect photos, build zines, and publish them.",
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/board");

  return (
    <AuthCard title="Create your studio" subtitle="Your Vision Board is private. Published zines are public.">
      <SignUpForm googleEnabled={googleEnabled()} />
    </AuthCard>
  );
}
