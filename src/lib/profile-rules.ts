import { z } from "zod";
import "@/lib/zod-setup";
import { checkHandle } from "@/lib/handles";
import { NAME_MAX } from "@/lib/signup";

/** Creator profile rules (DIG-111), shared by the API and the form. Client-safe. */
export const BIO_MAX = 160;
/** Current and old handles together (decision 0022), so one account cannot hoard them by renaming. */
export const HANDLES_PER_ACCOUNT = 5;

/**
 * Control characters and the invisible marks that reorder text (bidi overrides and isolates),
 * which would let a name or bio disguise itself. The bio keeps line breaks.
 */
const UNSAFE_NAME = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/;
const UNSAFE_BIO = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/;

/** Empty after trimming means "clear it". */
const emptyToNull = (s: string) => (s === "" ? null : s);

export const profileInput = z
  .object({
    handle: z.string({ error: "A handle is text." }).optional(),
    name: z
      .string({ error: "A name is text." })
      .trim()
      .max(NAME_MAX, `Keep your name to ${NAME_MAX} characters or fewer.`)
      .refine((s) => !UNSAFE_NAME.test(s), "Your name has a character that can't be shown.")
      .transform(emptyToNull)
      .optional(),
    bio: z
      .string({ error: "A bio is text." })
      .transform((s) => s.replace(/\r\n?/g, "\n").trim())
      .refine((s) => s.length <= BIO_MAX, `Keep your bio to ${BIO_MAX} characters or fewer.`)
      .refine((s) => !UNSAFE_BIO.test(s), "Your bio has a character that can't be shown.")
      .transform(emptyToNull)
      .optional(),
  })
  .strict();

export type ProfileInput = { handle?: string; name?: string | null; bio?: string | null };

export type ParsedProfile =
  | { ok: true; input: ProfileInput }
  | { ok: false; code: "invalid_request" | "handle_invalid" | "handle_reserved"; error: string };

/** Validates a profile change. The handle comes back in its stored, lowercase form. */
export function parseProfileInput(body: unknown): ParsedProfile {
  const parsed = profileInput.safeParse(body);
  if (!parsed.success) return { ok: false, code: "invalid_request", error: parsed.error.issues[0]?.message ?? "That change is not valid." };
  const input: ProfileInput = { ...parsed.data };
  if (parsed.data.handle !== undefined) {
    const handle = checkHandle(parsed.data.handle);
    if (!handle.ok) return handle;
    input.handle = handle.handle;
  }
  return { ok: true, input };
}
