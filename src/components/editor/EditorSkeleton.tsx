export function EditorSkeleton({ label }: { label: string }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="stack-y-4">
        <div className="h-9 w-64 max-w-full animate-pulse rounded-lg bg-paper-200" />
        <div className="h-24 animate-pulse rounded-2xl bg-paper-100" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-paper-100" />
        ))}
      </div>
    </main>
  );
}
