import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { VerifyEmailForm } from "@/components/VerifyEmailForm";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";

  return (
    <AuthCard title="Verify your email" subtitle="One more step before your studio opens.">
      {value ? (
        <VerifyEmailForm token={value} />
      ) : (
        <p className="text-sm text-ink-700">
          This link is missing its token. Open the link from your verification email, or{" "}
          <Link href="/signin" className="font-medium text-vermilion-600 underline hover:text-vermilion-500">
            sign in
          </Link>{" "}
          to ask for a new one.
        </p>
      )}
    </AuthCard>
  );
}
