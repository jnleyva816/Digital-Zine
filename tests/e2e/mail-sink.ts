import http from "node:http";

/** The port the e2e server is told to send "Resend" requests to (see playwright.config.ts). */
export const MAIL_PORT = Number(process.env.E2E_PORT ?? 3417) + 100;

export interface SentMail {
  to: string[];
  subject: string;
  text: string;
  authorization: string | undefined;
}

/**
 * A stand-in for Resend's `POST /emails` that records what the app sends, so a test can read the
 * real verification link out of the real message.
 */
export async function startMailSink() {
  const mail: SentMail[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}") as Partial<SentMail>;
      mail.push({
        to: body.to ?? [],
        subject: body.subject ?? "",
        text: body.text ?? "",
        authorization: req.headers.authorization,
      });
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"id":"e2e"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(MAIL_PORT, "127.0.0.1", resolve));

  return {
    mail,
    /** Verification links sent to `email`, oldest first. */
    linksFor: (email: string) =>
      mail
        .filter((m) => m.to.includes(email))
        .map((m) => m.text.match(/https?:\/\/\S+\/verify-email\?token=[\w-]+/)?.[0])
        .filter((link): link is string => Boolean(link)),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
