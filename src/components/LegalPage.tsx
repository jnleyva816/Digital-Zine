import type { ReactNode } from "react";
import Link from "next/link";

/** A plain reading page for the Terms and Privacy Policy (DIG-94). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/signin" className="font-serif text-xl font-bold tracking-tight text-ink-900">
        FOLIO
      </Link>
      <h1 className="mt-8 font-serif text-3xl font-bold text-ink-900">{title}</h1>
      <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink-500">Last updated {updated}</p>
      <div className="mt-8 space-y-4 text-sm leading-relaxed text-ink-700 [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}
