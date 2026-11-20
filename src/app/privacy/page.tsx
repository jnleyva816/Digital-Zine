import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Folio collects, why, and who handles it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="20 November 2026">
      <p>This explains what Folio collects, what it is used for, and who else handles it.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your name, your email address, and either a hashed password or your Google account&apos;s ID. We never store your password itself, and we never see your Google password.</li>
        <li><strong>Your work:</strong> the photos you upload, their camera details (EXIF), the Fujifilm recipes, captions, and zines you create.</li>
        <li><strong>Billing:</strong> if you subscribe, Stripe holds your payment details. We keep only a customer ID and your subscription status.</li>
        <li><strong>Technical data:</strong> your IP address is used to limit sign-in and sign-up attempts, and error reports (with the page and error, not your photos) help us fix bugs.</li>
      </ul>

      <h2>What is public</h2>
      <p>Your Vision Board is private. Once you publish a zine, anyone with its link can see it, including its photos, captions, camera details, and recipes. Your email address is never shown. Your name appears as the byline if you set one.</p>

      <h2>Who handles it for us</h2>
      <ul>
        <li><strong>Railway</strong> hosts the app and its database.</li>
        <li><strong>Cloudflare R2</strong> stores uploaded photos.</li>
        <li><strong>Stripe</strong> processes payments.</li>
        <li><strong>Google</strong>, if you choose Continue with Google, tells us your name, email address, and whether the email is verified.</li>
        <li><strong>Resend</strong> sends our emails, such as the verification link.</li>
        <li><strong>Sentry</strong> receives error reports.</li>
      </ul>
      <p>We do not sell your data and we do not run advertising.</p>

      <h2>Cookies</h2>
      <p>We set one cookie to keep you signed in, and one for admin preview settings. We do not use tracking cookies.</p>

      <h2>Keeping and deleting</h2>
      <p>We keep your data while your account exists. Deleting your account deletes your photos, stored files, zines, and recipes. Payment records may be kept by Stripe as the law requires.</p>

      <h2>Changes</h2>
      <p>If this policy changes in a way that matters, we will tell you by email or in the app.</p>
    </LegalPage>
  );
}
