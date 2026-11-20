/** Email is not set up on this server, so a verification link cannot be sent (DIG-94). */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured: set RESEND_API_KEY.");
  }
}

const DEFAULT_FROM = "Folio <onboarding@resend.dev>";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Mails the link that proves an email address is the creator's (DIG-94), through Resend's HTTP
 * API. With no `RESEND_API_KEY`, production refuses (the caller says email is not set up) and
 * everywhere else the link is printed to the server console so local sign-up still works.
 */
export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") throw new EmailNotConfiguredError();
    console.info(`[email] RESEND_API_KEY is not set. Verification link for ${to}: ${link}`);
    return;
  }

  const safe = escapeHtml(link);
  const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject: "Verify your email for Folio",
      text: `Welcome to Folio.\n\nVerify your email to open your studio:\n${link}\n\nThe link works once and expires in 24 hours. If you did not sign up, ignore this email.`,
      html: `<p>Welcome to Folio.</p><p><a href="${safe}">Verify your email</a> to open your studio.</p><p>Or paste this link into your browser:<br>${safe}</p><p>The link works once and expires in 24 hours. If you did not sign up, ignore this email.</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend rejected the email (${res.status}).`);
}
