import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { LandingPage } from "@/components/landing/LandingPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteUrl } from "@/lib/site/site";
import { landingJsonLd } from "@/lib/site/structured-data";

const title = "Folio: photo zines you can flip";
const description =
  "Collect your photographs on a private board, sequence them full-bleed, and publish a flip-through zine that shows the camera settings, or the Fujifilm recipe, behind every shot.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, type: "website", url: "/", siteName: "Folio" },
  twitter: { card: "summary_large_image", title, description },
};

/** Creators go straight to their board; everyone else sees what the app is (DIG-95). */
export default async function RootPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/board");
  return (
    <>
      <JsonLd data={landingJsonLd(siteUrl())} />
      <LandingPage />
    </>
  );
}
