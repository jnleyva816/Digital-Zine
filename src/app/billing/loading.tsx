export default function BillingLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading billing…</span>
      <div aria-hidden="true">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-paper-200" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded-sm bg-paper-100" />
        <div className="mt-6 h-36 animate-pulse rounded-2xl bg-paper-100" />
        <div className="mt-5 h-48 animate-pulse rounded-2xl bg-paper-100" />
      </div>
    </main>
  );
}
