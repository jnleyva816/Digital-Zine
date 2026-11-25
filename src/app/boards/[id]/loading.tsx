export default function BoardLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the board…</span>
      <div aria-hidden="true">
        <div className="h-9 w-56 animate-pulse rounded-lg bg-paper-200" />
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded-sm bg-paper-100" />
        <div className="mt-6 h-32 animate-pulse rounded-2xl bg-paper-100" />
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-paper-300 bg-white">
              <div className="aspect-4/5 animate-pulse bg-paper-200" />
              <div className="stack-y-2 p-4">
                <div className="h-4 w-2/3 animate-pulse rounded-sm bg-paper-100" />
                <div className="h-4 w-1/2 animate-pulse rounded-sm bg-paper-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
