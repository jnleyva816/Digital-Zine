import Link from "next/link";

export default function ZineNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Zine not found</h1>
      <p className="mt-2 text-sm text-ink-500">It may have been deleted, or it belongs to another creator.</p>
      <Link
        href="/editor"
        className="mt-5 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800"
      >
        Back to your zines
      </Link>
    </main>
  );
}
