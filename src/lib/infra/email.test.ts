import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailNotConfiguredError, sendGoogleSignInReminderEmail, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/infra/email";

// DIG-94: Resend over fetch. No dependency, and a clear failure when it is not set up.
const LINK = "https://zine.test/verify-email?token=abc123";

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_FROM", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("sendVerificationEmail", () => {
  it("posts the link to Resend with the API key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("EMAIL_FROM", "Folio <hello@zine.test>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendVerificationEmail("ada@example.com", LINK);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_123");
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ from: "Folio <hello@zine.test>", to: ["ada@example.com"] });
    expect(sent.subject).toMatch(/verify/i);
    expect(sent.html).toContain(LINK);
    expect(sent.text).toContain(LINK);
    vi.unstubAllGlobals();
  });

  it("posts to RESEND_API_URL when set, so tests can point it at a local mail sink", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_API_URL", "http://127.0.0.1:9999/emails");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendVerificationEmail("ada@example.com", LINK);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:9999/emails");
    vi.unstubAllGlobals();
  });

  it("throws when Resend refuses the message", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"bad"}', { status: 422 })));
    await expect(sendVerificationEmail("ada@example.com", LINK)).rejects.toThrow(/422/);
    vi.unstubAllGlobals();
  });

  describe("when Resend refuses the message (DIG-96)", () => {
    const refuse = (status: number, body: string) => {
      vi.stubEnv("RESEND_API_KEY", "re_secret_key_123");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
    };
    afterEach(() => vi.unstubAllGlobals());

    it("says what Resend said, so the owner can tell a test sender from an unverified domain", async () => {
      refuse(403, JSON.stringify({ name: "validation_error", message: "You can only send testing emails to your own email address." }));
      const error = await sendVerificationEmail("ada@example.com", LINK).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("403");
      expect((error as Error).message).toContain("You can only send testing emails to your own email address.");
      expect((error as Error).message).toContain("validation_error");
    });

    it("never puts the API key or the recipient in the error", async () => {
      refuse(401, JSON.stringify({ name: "restricted_api_key", message: "API key is invalid" }));
      const error = (await sendVerificationEmail("ada@example.com", LINK).catch((e: Error) => e)) as Error;
      expect(error.message).not.toContain("re_secret_key_123");
      expect(error.message).not.toContain("ada@example.com");
    });

    it("cuts a long body short", async () => {
      refuse(500, JSON.stringify({ message: "x".repeat(5000) }));
      const error = (await sendVerificationEmail("ada@example.com", LINK).catch((e: Error) => e)) as Error;
      expect(error.message.length).toBeLessThan(400);
      expect(error.message).toContain("500");
    });

    it.each([
      ["a body that is not JSON", "<html>Bad gateway</html>", /Bad gateway/],
      ["an empty body", "", /502/],
    ])("still gives a useful error for %s", async (_label, body, expected) => {
      refuse(502, body);
      await expect(sendVerificationEmail("ada@example.com", LINK)).rejects.toThrow(expected);
    });
  });

  it("throws EmailNotConfiguredError in production without a key, and never fetches", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendVerificationEmail("ada@example.com", LINK)).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("prints the link to the console outside production when there is no key", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await sendVerificationEmail("ada@example.com", LINK);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).toContain(LINK);
    vi.unstubAllGlobals();
  });
});

// DIG-107: the password reset email and the Google reminder share the sender with verification.
describe("sendPasswordResetEmail", () => {
  const RESET = "https://zine.test/reset-password?token=abc123";

  it("posts the link, and says it works once and for one hour", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendPasswordResetEmail("ada@example.com", RESET);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.to).toEqual(["ada@example.com"]);
    expect(sent.subject).toMatch(/reset/i);
    for (const part of [sent.text, sent.html]) {
      expect(part).toContain(RESET);
      expect(part).toMatch(/one hour/i);
      expect(part).toMatch(/ignore this email/i);
    }
    vi.unstubAllGlobals();
  });

  it("escapes the link in the HTML part", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendPasswordResetEmail("ada@example.com", 'https://zine.test/r?a=1&b="2"');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).toContain("a=1&amp;b=&quot;2&quot;");
    vi.unstubAllGlobals();
  });

  it("throws with Resend's reason when it refuses, and refuses in production without a key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"name":"validation_error","message":"bad"}', { status: 422 })));
    await expect(sendPasswordResetEmail("ada@example.com", RESET)).rejects.toThrow("Resend rejected the email (422): validation_error: bad");
    vi.unstubAllGlobals();
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendPasswordResetEmail("ada@example.com", RESET)).rejects.toBeInstanceOf(EmailNotConfiguredError);
  });

  it("prints the link to the console without a key outside production", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await sendPasswordResetEmail("ada@example.com", RESET);
    expect(info).toHaveBeenCalledWith(expect.stringContaining(RESET));
    info.mockRestore();
  });
});

describe("sendGoogleSignInReminderEmail", () => {
  it("says to sign in with Google, links the sign-in page, and carries no reset link", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendGoogleSignInReminderEmail("ada@example.com", "https://zine.test/signin");
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.to).toEqual(["ada@example.com"]);
    for (const part of [sent.text, sent.html]) {
      expect(part).toMatch(/sign in with google/i);
      expect(part).toContain("https://zine.test/signin");
      expect(part).not.toMatch(/reset-password|token=/);
    }
    vi.unstubAllGlobals();
  });
});
