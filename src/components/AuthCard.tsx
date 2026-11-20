import type { ReactNode } from "react";

/** The Folio header and white card the account pages share (DIG-94). */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-baseline justify-center gap-2.5">
          <span className="font-serif text-2xl font-bold tracking-tight text-ink-900">FOLIO</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500">Digital Zine</span>
        </div>

        <div className="mt-8 rounded-2xl border border-paper-300 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="font-serif text-2xl font-bold text-ink-900">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
