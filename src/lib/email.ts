/** Email is not set up on this server, so a verification link cannot be sent (DIG-94). */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured: set RESEND_API_KEY.");
  }
}

const DEFAULT_FROM = "Folio <onboarding@resend.dev>";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Message {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** What to print when no mail service is set up, outside production. */
  console: string;
}

/**
 * Sends one message through Resend's HTTP API. With no `RESEND_API_KEY`, production refuses (the
 * caller says email is not set up) and everywhere else the message's link is printed to the server
 * console so local sign-up and password reset still work.
 */
async function deliver(message: Message): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") throw new EmailNotConfiguredError();
    console.info(`[email] RESEND_API_KEY is not set. ${message.console}`);
    return;
  }

  const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (!res.ok) throw new Error(await resendFailure(res));
}

/** Mails the link that proves an email address is the creator's (DIG-94). */
export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  const safe = escapeHtml(link);
  await deliver({
    to,
    subject: "Verify your email for Folio",
    text: `Welcome to Folio.\n\nVerify your email to open your studio:\n${link}\n\nThe link works once and expires in 24 hours. If you did not sign up, ignore this email.`,
    html: `<p>Welcome to Folio.</p><p><a href="${safe}">Verify your email</a> to open your studio.</p><p>Or paste this link into your browser:<br>${safe}</p><p>The link works once and expires in 24 hours. If you did not sign up, ignore this email.</p>`,
    console: `Verification link for ${to}: ${link}`,
  });
}

/** Mails the link that lets a creator choose a new password (DIG-107). */
export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  const safe = escapeHtml(link);
  await deliver({
    to,
    subject: "Reset your Folio password",
    text: `Someone asked to reset the password for your Folio account.\n\nChoose a new password:\n${link}\n\nThe link works once and expires in one hour. If you did not ask for this, ignore this email and your password stays as it is.`,
    html: `<p>Someone asked to reset the password for your Folio account.</p><p><a href="${safe}">Choose a new password</a></p><p>Or paste this link into your browser:<br>${safe}</p><p>The link works once and expires in one hour. If you did not ask for this, ignore this email and your password stays as it is.</p>`,
    console: `Password reset link for ${to}: ${link}`,
  });
}

/**
 * What an account that only signs in with Google gets when it asks to reset a password it does not
 * have (DIG-107): where to sign in. No reset link, because there is nothing to reset.
 */
export async function sendGoogleSignInReminderEmail(to: string, signInLink: string): Promise<void> {
  const safe = escapeHtml(signInLink);
  await deliver({
    to,
    subject: "Sign in to Folio with Google",
    text: `Someone asked to reset the password for your Folio account, but this account signs in with Google and has no password.\n\nSign in with Google here:\n${signInLink}\n\nIf you did not ask for this, ignore this email.`,
    html: `<p>Someone asked to reset the password for your Folio account, but this account signs in with Google and has no password.</p><p><a href="${safe}">Sign in with Google</a></p><p>If you did not ask for this, ignore this email.</p>`,
    console: `Google sign-in reminder for ${to}: ${signInLink}`,
  });
}

const DETAIL_MAX = 300;

/**
 * What to log when Resend refuses a message (DIG-96): the status and Resend's own reason, such as
 * "You can only send testing emails to your own email address". Only Resend's response is used,
 * never our request, so the API key and the recipient cannot end up in the log.
 */
async function resendFailure(res: Response): Promise<string> {
  const raw = (await res.text().catch(() => "")).trim();
  let detail = raw;
  try {
    const body = JSON.parse(raw) as { name?: unknown; message?: unknown };
    const parts = [body.name, body.message].filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length > 0) detail = parts.length === 2 ? `${parts[0]}: ${parts[1]}` : parts[0];
  } catch {
    // Not JSON (a proxy error page, say): the text itself is the best detail there is.
  }
  const clipped = detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX)}…` : detail;
  return clipped ? `Resend rejected the email (${res.status}): ${clipped}` : `Resend rejected the email (${res.status}).`;
}
