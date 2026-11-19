/** Secrets committed in this repository (`.env.example`, `.env.test`). Anyone can read them. */
const EXAMPLE_SECRET = "dev-digital-zine-secret-change-in-production-32chars";
const TEST_SECRET = "test-digital-zine-secret-not-for-production-32chars";
export const COMMITTED_AUTH_SECRETS = [EXAMPLE_SECRET, TEST_SECRET];

const HOW = "Generate one with `openssl rand -base64 32` and set AUTH_SECRET in the server's environment.";

/**
 * Why `AUTH_SECRET` is unsafe for a production server, or null (DIG-42). Session tokens are signed
 * with it, so a missing, short, or published secret lets anyone sign in as any user. Only checked
 * when a production server starts: not in development, and not during `next build`. The e2e
 * tests run a production server with the committed test secret, so they set ALLOW_TEST_AUTH_SECRET.
 */
export function authSecretProblem(env: Record<string, string | undefined>): string | null {
  if (env.NODE_ENV !== "production" || env.NEXT_PHASE === "phase-production-build") return null;
  const secret = env.AUTH_SECRET?.trim() ?? "";
  if (!secret) return `AUTH_SECRET is not set. ${HOW}`;
  if (secret.length < 32) return `AUTH_SECRET is shorter than 32 characters. ${HOW}`;
  if (secret === EXAMPLE_SECRET) return `AUTH_SECRET is the example value from .env.example. ${HOW}`;
  if (secret === TEST_SECRET && env.ALLOW_TEST_AUTH_SECRET !== "1") {
    return `AUTH_SECRET is the test value from .env.test. ${HOW}`;
  }
  return null;
}

/** Stops the server from starting with an unsafe AUTH_SECRET. */
export function assertSafeAuthSecret(env: Record<string, string | undefined> = process.env): void {
  const problem = authSecretProblem(env);
  if (problem) throw new Error(`Refusing to start: ${problem}`);
}
