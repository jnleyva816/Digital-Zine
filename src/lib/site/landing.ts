import { ACCOUNT_STORAGE_BYTES, boardLimitFor, formatBytes, zineLimitFor } from "../billing/limits";
import { PRO_MONTHLY_PRICE_CENTS } from "../billing/stripe";

/** Where the sign-up buttons on the landing page go (DIG-95, DIG-97). */
export const SIGNUP_HREF = "/signup";

export interface LandingTier {
  name: "Free" | "Pro";
  price: string;
  period: string;
  blurb: string;
  features: string[];
  cta: string;
  featured: boolean;
}

function dollars(cents: number): string {
  return `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
}

function counted(limit: number | null, one: string, unlimited: string): string {
  return limit === null ? unlimited : `${limit} ${one}`;
}

/**
 * The tier list, built from the limits the app enforces (`limits.ts`, `stripe.ts`), so the page
 * cannot promise something the app does not do.
 */
export function landingTiers(): [LandingTier, LandingTier] {
  const storage = `${formatBytes(ACCOUNT_STORAGE_BYTES)} of photo storage`;
  return [
    {
      name: "Free",
      price: "$0",
      period: "no card needed",
      blurb: "Everything you need to publish your first zine.",
      features: [
        counted(boardLimitFor("free"), "Vision Board", "Unlimited Vision Boards"),
        counted(zineLimitFor("free"), "zine", "Unlimited zines"),
        storage,
        "A public flip-through page for each zine",
        "Camera EXIF and Fujifilm recipes on every card",
      ],
      cta: "Start free",
      featured: false,
    },
    {
      name: "Pro",
      price: dollars(PRO_MONTHLY_PRICE_CENTS),
      period: "per month",
      blurb: "For photographers who keep making them.",
      features: [
        counted(boardLimitFor("pro"), "Vision Board", "Unlimited Vision Boards"),
        counted(zineLimitFor("pro"), "zine", "Unlimited zines"),
        "PDF export",
        storage,
        "Everything else in Free",
      ],
      cta: "Get Pro",
      featured: true,
    },
  ];
}
