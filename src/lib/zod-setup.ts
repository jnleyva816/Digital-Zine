import { z } from "zod";

/**
 * Zod 4 builds fast validators with `new Function`, and first probes whether that is allowed. A strict
 * Content Security Policy blocks it and reports a violation for the probe, even though zod catches the
 * failure (DIG-109). With `jitless` it never tries. Schemas that reach the browser import this file
 * for its effect; server-only routes keep the fast path, since the policy does not apply to them.
 */
z.config({ jitless: true });
