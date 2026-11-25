import type { Metadata } from "next";
import Link from "next/link";
import { FoldingSteps } from "@/components/editor/FoldingSteps";

export const metadata: Metadata = {
  title: "How to fold a mini zine",
  description: "Six steps that turn one printed sheet into an eight-page booklet.",
  alternates: { canonical: "/help/mini-zine" },
};

/** The folding steps on a page of their own, to keep open beside the printer (DIG-74). */
export default function FoldMiniZinePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link href="/" className="font-serif text-xl font-bold tracking-tight text-ink-900">
        FOLIO
      </Link>
      <h1 id="fold" className="mt-8 font-serif text-3xl font-bold text-ink-900">
        How to fold a mini zine
      </h1>
      <p className="mb-8 mt-2 text-sm text-ink-700">One Letter or A4 sheet, a few folds, and one cut make an 8-page booklet.</p>
      <FoldingSteps labelledBy="fold" />
    </main>
  );
}
