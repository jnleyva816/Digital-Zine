export default function PublicZineNotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Zine not found</h1>
      <p className="mt-2 text-sm text-ink-500">
        This zine may have been unpublished or deleted, or the link may be mistyped.
      </p>
    </main>
  );
}
