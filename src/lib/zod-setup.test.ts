import { afterEach, describe, expect, it, vi } from "vitest";

// DIG-109: zod 4 probes `new Function` to build a fast validator. A strict Content Security Policy
// reports that probe as a violation even though zod catches the failure.
describe("zod under a strict Content Security Policy", () => {
  const RealFunction = globalThis.Function;
  afterEach(() => {
    globalThis.Function = RealFunction;
    vi.resetModules();
  });

  it("parses a schema from a client-reachable module without ever calling new Function", async () => {
    vi.resetModules();
    const calls: unknown[] = [];
    // A stand-in that records the call and still works, so a probe is seen, not just survived.
    const Spy = function (this: unknown, ...args: string[]) {
      calls.push(args);
      return RealFunction(...args);
    } as unknown as FunctionConstructor;
    globalThis.Function = Spy;

    const { signupSchema } = await import("./signup");
    signupSchema.safeParse({ name: "A", email: "a@b.co", password: "x", confirmPassword: "x", acceptedTerms: true });
    const { boardNameSchema } = await import("./boards");
    boardNameSchema.safeParse("B");

    expect(calls).toEqual([]);
  });
});
