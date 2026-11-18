"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BookOpen, CreditCard, ExternalLink, Layers, LogOut, Sparkles } from "lucide-react";

interface StudioHeaderProps {
  user: {
    email: string;
    name: string | null;
    tier: "free" | "pro";
  };
  activeZineId?: string | null;
  publishedSlug?: string | null;
}

export function StudioHeader({
  user,
  activeZineId,
  publishedSlug,
}: StudioHeaderProps) {
  const pathname = usePathname();
  const editorHref = activeZineId ? `/editor/${activeZineId}` : "/editor";

  return (
    <header className="sticky top-0 z-30 border-b border-paper-300 bg-paper-50/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/board" className="group flex items-baseline gap-2.5">
            <span className="font-serif text-xl font-bold tracking-tight text-ink-900">
              FOLIO
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500">
              Digital Zine
            </span>
          </Link>

          <nav className="flex items-center gap-1 rounded-full border border-paper-300 bg-paper-100 p-1 text-sm">
            <Link
              href="/board"
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition ${
                pathname.startsWith("/board")
                  ? "bg-ink-900 text-paper-50 shadow-sm"
                  : "text-ink-700 hover:text-ink-900"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Vision Board
            </Link>
            <Link
              href={editorHref}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition ${
                pathname.startsWith("/editor")
                  ? "bg-ink-900 text-paper-50 shadow-sm"
                  : "text-ink-700 hover:text-ink-900"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Zine Editor
            </Link>
            <Link
              href="/billing"
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition ${
                pathname.startsWith("/billing")
                  ? "bg-ink-900 text-paper-50 shadow-sm"
                  : "text-ink-700 hover:text-ink-900"
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" />
              Billing
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {publishedSlug ? (
            <Link
              href={`/z/${publishedSlug}`}
              className="hidden items-center gap-1.5 rounded-full border border-paper-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-800 transition hover:border-ink-700 sm:inline-flex"
            >
              Public Viewer
              <ExternalLink className="h-3 w-3 text-vermilion-500" />
            </Link>
          ) : null}

          <Link
            href="/billing"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wider ${
              user.tier === "pro"
                ? "bg-vermilion-500 text-white"
                : "border border-paper-300 bg-paper-200/70 text-ink-800 hover:border-vermilion-500"
            }`}
          >
            <Sparkles className="h-3 w-3" />
            {user.tier === "pro" ? "Pro Tier" : "Free Tier"}
          </Link>

          <span className="hidden text-xs text-ink-500 md:inline">
            {user.name ?? user.email}
          </span>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="inline-flex items-center gap-1.5 rounded-full border border-paper-300 px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:bg-paper-200 hover:text-ink-900"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
