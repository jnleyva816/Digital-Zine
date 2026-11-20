import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailNotConfiguredError, sendVerificationEmail } from "@/lib/email";

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
