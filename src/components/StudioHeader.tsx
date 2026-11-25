"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Aperture, BookOpen, CircleUserRound, ExternalLink, LayoutGrid, LogOut } from "lucide-react";
import { AdminViewBanner, AdminViewToggle } from "./AdminViewToggle";

const NAV = [
  { href: "/boards", match: "/board", label: "Boards" },
  { href: "/editor", match: "/editor", label: "Zines" },
  { href: "/recipes", match: "/recipes", label: "Recipes" },
] as const;

/** The bottom bar on small screens (DIG-93). */
const TABS = [
  { href: "/boards", matches: ["/board"], label: "Boards", icon: LayoutGrid },
  { href: "/editor", matches: ["/editor"], label: "Zines", icon: BookOpen },
  { href: "/recipes", matches: ["/recipes"], label: "Recipes", icon: Aperture },
  { href: "/account", matches: ["/account", "/billing"], label: "Account", icon: CircleUserRound },
] as const;

const focus = "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-500";

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

interface StudioHeaderProps {
  user: {
    email: string;
    name: string | null;
    /** The tier features use: Pro for admins unless they are viewing as Free. */
    tier: "free" | "pro";
    role: "user" | "admin";
    viewingAsFree: boolean;
  };
  activeZineId?: string | null;
  /** The address of the creator's published zine, like /z/ab12cd34/golden-hour (DIG-102). */
  publishedPath?: string | null;
}

/** The app bar (DIG-86): where you are, your plan, and your account. */
export function StudioHeader({ user, publishedPath }: StudioHeaderProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isAdmin = user.role === "admin";
  const showAdminBadge = isAdmin && !user.viewingAsFree;
  const plan = showAdminBadge ? "Admin" : user.tier === "pro" ? "Pro" : "Free";

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = `flex min-h-11 w-full items-center lg:min-h-10 gap-2 rounded-lg px-3 text-left text-sm text-ink-800 hover:bg-paper-100 ${focus}`;

  return (
    <>
    <header className="sticky top-0 z-30 border-b border-paper-300 bg-paper-50/95 backdrop-blur-sm">
      {isAdmin && user.viewingAsFree ? <AdminViewBanner /> : null}
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-7">
          <Link href="/boards" aria-label="Folio Digital Zine" className={`flex min-h-11 items-center gap-2 rounded-sm ${focus}`}>
            <span className="font-serif text-xl font-bold tracking-tight text-ink-900">FOLIO</span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500 md:inline">Digital Zine</span>
          </Link>
          <nav aria-label="Studio" className="hidden gap-0.5 text-sm lg:flex">
            {NAV.map(({ href, match, label }) => {
              const current = pathname.startsWith(match);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={`rounded-full px-2.5 py-2 sm:px-3 ${focus} ${current ? "bg-ink-900 text-paper-50" : "text-ink-700 hover:text-ink-900"}`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {isAdmin ? <AdminViewToggle viewingAsFree={user.viewingAsFree} /> : null}
          <Link
            href="/billing"
            aria-label={`${plan} plan`}
            className={`hidden rounded-full px-2.5 py-1 font-mono text-[11px] lg:inline uppercase tracking-wider ${focus} ${
              plan === "Free" ? "border border-paper-300 text-ink-700 hover:border-vermilion-500" : plan === "Pro" ? "bg-vermilion-600 text-white" : "bg-ink-900 text-paper-50"
            }`}
          >
            {plan}
          </Link>
          <div ref={menuRef} className="relative">
            <button
              ref={buttonRef}
              type="button"
              aria-label="Account menu"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className={`-mr-1 flex h-11 w-11 items-center justify-center rounded-full lg:mr-0 lg:h-9 lg:w-9 ${focus}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2C3A4A] text-[13px] font-semibold text-paper-50">{initials(user.name?.trim() || user.email)}</span>
            </button>
            {open ? (
              <div className="absolute right-0 top-11 w-60 rounded-xl border border-paper-300 bg-white p-1.5 shadow-lg">
                <div className="border-b border-paper-200 px-3 pb-2 pt-1">
                  {user.name ? <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p> : null}
                  <p className="truncate text-xs text-ink-500">{user.email}</p>
                </div>
                <div className="pt-1.5">
                  {publishedPath ? (
                    <Link href={publishedPath} className={item}>
                      Public Viewer
                      <ExternalLink className="h-3.5 w-3.5 text-vermilion-600" aria-hidden="true" />
                    </Link>
                  ) : null}
                  <Link href="/billing" className={item}>
                    Billing
                    <span aria-hidden="true" className="ml-auto font-mono text-[11px] uppercase text-ink-500 lg:hidden">{plan}</span>
                  </Link>
                  <Link href="/account" className={item}>Account</Link>
                  <button type="button" onClick={() => signOut({ callbackUrl: "/signin" })} className={item}>
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
    <nav
      aria-label="Studio"
      data-studio-tabs=""
      className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-4 border-t border-paper-300 bg-paper-50 px-3 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {TABS.map(({ href, matches, label, icon: Icon }) => {
        const current = matches.some((m) => pathname.startsWith(m));
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] ${focus} ${current ? "font-bold text-ink-900" : "text-ink-500"}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
    </>
  );
}
