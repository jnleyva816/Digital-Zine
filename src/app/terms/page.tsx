import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Folio.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="20 November 2026">
      <p>These terms cover your use of Folio, a service for collecting photos on a private Vision Board and publishing them as zines. By creating an account you agree to them.</p>

      <h2>Your account</h2>
      <ul>
        <li>Give a real email address and keep your password to yourself. You are responsible for what happens in your account.</li>
        <li>You must be old enough to enter a contract where you live, and in any case at least 16.</li>
      </ul>

      <h2>Your photos and words</h2>
      <ul>
        <li>You keep ownership of everything you upload or write.</li>
        <li>You give us permission to store, resize, convert, and display it, only so we can run Folio for you. We make smaller copies and keep a full-resolution copy in AVIF.</li>
        <li>Only upload photos you took or have the right to use.</li>
        <li>Your Vision Board is private. A zine is public only after you publish it, and then anyone with the link can see its photos, captions, camera details, and any Fujifilm recipe you add to a card. Unpublish it to take it down.</li>
      </ul>

      <h2>What you must not do</h2>
      <ul>
        <li>Upload anything illegal, or that infringes someone else&apos;s rights, or that sexually exploits or endangers anyone.</li>
        <li>Harass people, or publish other people&apos;s private information.</li>
        <li>Probe, overload, or break the service, or use it to attack others.</li>
      </ul>
      <p>We can remove content or close accounts that break these rules.</p>

      <h2>Plans and payment</h2>
      <ul>
        <li>Free includes one zine and one board. Pro costs $15 a month and adds unlimited zines and boards and PDF export.</li>
        <li>Payments are handled by Stripe. Pro renews each month until you cancel it from the billing page. Cancelling stops the next charge.</li>
        <li>Every account has 2 GB of storage across all its boards.</li>
      </ul>

      <h2>Ending your account</h2>
      <p>You can stop using Folio at any time. When an account is deleted, its photos and stored files are deleted with it.</p>

      <h2>No guarantees</h2>
      <p>Folio is provided as it is. We work to keep it running and your files safe, but we cannot promise it will never be down or lose data, so keep your original photos. To the extent the law allows, we are not liable for indirect or lost-profit damages, and our total liability is limited to what you paid us in the 12 months before the claim.</p>

      <h2>Changes</h2>
      <p>We may update these terms. If a change matters, we will tell you by email or in the app before it applies.</p>
    </LegalPage>
  );
}
