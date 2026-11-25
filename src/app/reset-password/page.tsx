import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  // The link carries the token, so the next page must not see it in a Referer header.
  referrer: "no-referrer",
};

/** Opening the link spends nothing; the creator presses the button (DIG-107). */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";

  return (
    <AuthCard title="Choose a new password" subtitle="Pick one you have not used before.">
      {value ? (
        <ResetPasswordForm token={value} />
      ) : (
        <p className="text-sm text-ink-700">
          This link is missing its token. Open the link from your reset email, or{" "}
          <Link href="/forgot-password" className="font-medium text-vermilion-600 underline hover:text-vermilion-500">
            ask for a new link
          </Link>
          .
        </p>
      )}
    </AuthCard>
  );
}
