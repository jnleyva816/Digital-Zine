import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import { headers } from "next/headers";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

// The browser's address bar and a phone's status bar take these colors (DIG-105).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.paper },
    { media: "(prefers-color-scheme: dark)", color: BRAND.ink },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  // Listed in full: naming any one icon here replaces the ones Next would find in src/app.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  title: {
    default: "Folio — Digital Photo Zines",
    template: "%s · Folio Digital Zine",
  },
  description:
    "Draft on a private Vision Board, sequence full-bleed photo zines, and publish flip cards that show each photo's camera EXIF or Fujifilm film recipe.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading the request makes every page render per request. A page prerendered at build time cannot
  // carry the Content Security Policy's per-request nonce, so its scripts would be blocked (DIG-104).
  await headers();
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper-50 text-ink-900 font-sans">
        {children}
      </body>
    </html>
  );
}
