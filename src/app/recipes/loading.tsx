export default function RecipesLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your recipes…</span>
      <div aria-hidden="true">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-paper-200" />
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded-sm bg-paper-100" />
        <div className="mt-6 h-10 w-36 animate-pulse rounded-xl bg-paper-200" />
        <div className="mt-6 stack-y-px overflow-hidden rounded-2xl border border-paper-300">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse bg-paper-100" />
          ))}
        </div>
      </div>
    </main>
  );
}
