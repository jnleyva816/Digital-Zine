import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { landingTiers, SIGNUP_HREF, type LandingTier } from "@/lib/landing";

const focus =
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion-600";

const STEPS = [
  {
    title: "Collect",
    body: "Drop in your JPEGs. They stay on a private Vision Board that only you can see, in the order you choose.",
  },
  {
    title: "Sequence",
    body: "Pick the frames, put them in order, and add a caption where a page needs one. One full-bleed page per photo.",
  },
  {
    title: "Publish",
    body: "Share a single link. Readers flip each card to see the camera settings, or the film recipe, behind the picture.",
  },
] as const;

const DETAILS = [
  {
    title: "Camera EXIF",
    body: "ISO, aperture, shutter speed, focal length, camera and lens. Read from the file in your browser before it uploads.",
  },
  {
    title: "Fujifilm recipes",
    body: "Film simulation, grain, white balance shifts and more. Folio reads them from the photo, and you confirm before anything is saved.",
  },
  {
    title: "Private by default",
    body: "The Vision Board is never public. Only the zines you publish are, and you can unpublish one whenever you like.",
  },
] as const;

/**
 * The page signed-out visitors see at `/` (DIG-95): what the app is for, how it works, and what
 * each tier includes. A server component; nothing here needs the browser.
 */
export function LandingPage() {
  const tiers = landingTiers();
  return (
    <div className="min-h-screen bg-paper-50 text-ink-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <p className="flex items-baseline gap-2.5">
          <span className="font-serif text-xl font-bold tracking-tight">FOLIO</span>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500 sm:inline">
            Digital Zine
          </span>
        </p>
        <nav aria-label="Account">
          <Link
            href="/signin"
            className={`rounded-full px-4 py-2 text-sm font-medium text-ink-800 transition hover:bg-paper-100 ${focus}`}
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-16">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-vermilion-600">
              Photo zines you can flip
            </p>
            <h1 className="mt-5 font-serif text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl sm:leading-none lg:text-6xl">
              Your best photographs, bound into a zine.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-700">
              Collect frames on a private board, sequence them full-bleed, and publish a flip-through zine that
              shows the camera settings, or the Fujifilm recipe, behind every shot.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                href={SIGNUP_HREF}
                className={`inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-paper-50 shadow-xs transition hover:bg-ink-800 ${focus}`}
              >
                Start free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href="#how-it-works"
                className={`rounded-xs text-sm font-medium text-ink-700 underline underline-offset-4 transition hover:text-ink-900 ${focus}`}
              >
                See how it works
              </a>
            </div>
          </div>
          <SampleCard />
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="border-t border-paper-300 bg-paper-100/60"
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 id="how-it-works-heading" className="font-serif text-3xl font-bold tracking-tight">
              How it works
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <span className="font-mono text-xs tracking-[0.2em] text-vermilion-600" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 font-serif text-2xl font-bold">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-ink-700">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="details-heading" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 id="details-heading" className="font-serif text-3xl font-bold tracking-tight">
            Made for the way you shoot
          </h2>
          <dl className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {DETAILS.map((d) => (
              <div key={d.title} className="border-t border-ink-900 pt-5">
                <dt className="font-serif text-xl font-bold">{d.title}</dt>
                <dd className="mt-3 leading-relaxed text-ink-700">{d.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          id="pricing"
          aria-labelledby="pricing-heading"
          className="border-t border-paper-300 bg-paper-100/60"
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 id="pricing-heading" className="font-serif text-3xl font-bold tracking-tight">
              Pricing
            </h2>
            <p className="mt-3 max-w-xl text-ink-700">Start free. Upgrade when one board is no longer enough.</p>
            <div className="mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
              {tiers.map((tier) => (
                <TierCard key={tier.name} tier={tier} />
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-paper-300">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-5 py-8 text-sm text-ink-500 sm:px-8">
          <p className="font-serif text-base font-bold text-ink-900">FOLIO</p>
          <p>Photo zines you can flip.</p>
        </div>
      </footer>
    </div>
  );
}

function TierCard({ tier }: { tier: LandingTier }) {
  const id = `tier-${tier.name.toLowerCase()}`;
  return (
    <article
      aria-labelledby={id}
      className={`flex flex-col rounded-2xl bg-white p-7 shadow-xs ${
        tier.featured ? "border-2 border-ink-900" : "border border-paper-300"
      }`}
    >
      <h3 id={id} className="font-serif text-2xl font-bold">
        {tier.name}
      </h3>
      <p className="mt-1.5 text-sm text-ink-500">{tier.blurb}</p>
      <p className="mt-6 flex items-baseline gap-2">
        <span className="font-serif text-5xl font-bold tracking-tight">{tier.price}</span>
        <span className="text-sm text-ink-500">{tier.period}</span>
      </p>
      <ul className="mt-7 stack-y-3 text-sm text-ink-800">
        {tier.features.map((feature) => (
          <li key={feature} className="flex gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-600" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href={SIGNUP_HREF}
        className={`mt-8 inline-flex justify-center rounded-full px-6 py-3 text-sm font-semibold transition ${focus} ${
          tier.featured
            ? "bg-ink-900 text-paper-50 hover:bg-ink-800"
            : "border border-ink-900 text-ink-900 hover:bg-paper-100"
        }`}
      >
        {tier.cta}
      </Link>
    </article>
  );
}

/** An illustration of the product: a photo on the front, its settings on the back. Not a real photo. */
function SampleCard() {
  return (
    <div
      role="img"
      aria-label="Sample zine card: the photo on the front, its camera settings and film recipe on the back."
      className="relative mx-auto h-84 w-full max-w-md sm:h-120"
    >
      {/* The back sits to the right, with its text clear of the photo that overlaps its left edge. */}
      <div
        aria-hidden="true"
        className="absolute right-0 top-8 h-68 w-50 rotate-[4deg] rounded-xl border border-paper-300 bg-paper-100 py-4 pl-12 pr-4 shadow-lg sm:h-100 sm:w-68 sm:py-6 sm:pl-18 sm:pr-6"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">Camera</p>
        <p className="mt-2 font-mono text-xs leading-relaxed text-ink-800">
          X-T5 · 33mm
          <br />
          f/2.8 · 1/250s
          <br />
          ISO 400
        </p>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">Recipe</p>
        <p className="mt-2 font-mono text-xs leading-relaxed text-ink-800">
          Classic Chrome
          <br />
          DR200 · Grain Weak
          <br />
          Daylight · R+2 B−5
          <span className="hidden sm:inline">
            <br />
            Shadow +0.5
          </span>
        </p>
      </div>
      <div
        aria-hidden="true"
        className="absolute left-0 top-0 z-10 h-68 w-44 rotate-[-4deg] overflow-hidden rounded-xl border border-paper-300 shadow-xl sm:h-100 sm:w-60"
      >
        <div className="absolute inset-0 bg-linear-to-b from-[#f4c98f] via-[#d98259] to-[#34262f]" />
        <div className="absolute left-1/2 top-[34%] h-16 w-16 -translate-x-1/2 rounded-full bg-[#fde8bd]" />
        <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[#2a1f27]" />
        <p className="absolute inset-x-4 bottom-4 font-serif text-base leading-snug text-paper-50 sm:inset-x-5 sm:bottom-5 sm:text-lg sm:leading-7">
          Last light on the harbor.
        </p>
      </div>
    </div>
  );
}
