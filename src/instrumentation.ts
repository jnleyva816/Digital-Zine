/**
 * Runs once when the Next.js server starts. The media worker (DIG-26) is Node-only (sharp, pg),
 * so it lives in instrumentation-node.ts and is imported only inside the NEXT_RUNTIME check, which
 * Next replaces at build time. That keeps sharp out of the edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
