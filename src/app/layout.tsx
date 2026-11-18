import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Folio — Digital Photo Zines",
    template: "%s · Folio Digital Zine",
  },
  description:
    "Draft on a private Vision Board, sequence full-bleed photo zines, and publish flip cards that show each photo's camera EXIF or Fujifilm film recipe.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper-50 text-ink-900 font-sans">
        {children}
      </body>
    </html>
  );
}
