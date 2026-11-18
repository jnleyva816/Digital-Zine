import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { SignInForm } from "@/components/SignInForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Folio studio to draft, sequence, and publish zines.",
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/board");
  }

  const showDevCredentials = process.env.NODE_ENV !== "production";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-baseline justify-center gap-2.5">
          <span className="font-serif text-2xl font-bold tracking-tight text-ink-900">
            FOLIO
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500">
            Digital Zine
          </span>
        </div>

        <div className="mt-8 rounded-2xl border border-paper-300 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="font-serif text-2xl font-bold text-ink-900">Sign in to your studio</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Your Vision Board is private. Published zines are public.
          </p>

          <div className="mt-6">
            <Suspense fallback={<SignInFormSkeleton />}>
              <SignInForm showDevCredentials={showDevCredentials} />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}

function SignInFormSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="h-[66px] animate-pulse rounded-xl bg-paper-100" />
      <div className="h-[66px] animate-pulse rounded-xl bg-paper-100" />
      <div className="h-11 animate-pulse rounded-xl bg-paper-200" />
    </div>
  );
}
