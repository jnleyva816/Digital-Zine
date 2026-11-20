import { z } from "zod";

/** bcrypt only reads the first 72 bytes, so a longer password would be silently cut short. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const NAME_MAX = 80;

/**
 * What the signup form sends (DIG-94). The browser and `POST /api/signup` use this one schema, so
 * the form and the server never disagree about what is valid.
 */
export const signupSchema = z
  .object({
    name: z
      .string({ error: "Enter your name." })
      .trim()
      .min(1, "Enter your name.")
      .max(NAME_MAX, `Your name can be up to ${NAME_MAX} characters.`),
    email: z
      .string({ error: "Enter your email." })
      .trim()
      .toLowerCase()
      .max(254, "That email address is too long.")
      .email("Enter a valid email address."),
    password: z
      .string({ error: "Choose a password." })
      .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
      .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`),
    confirmPassword: z.string({ error: "Type the password again." }),
    acceptTerms: z.literal(true, { error: "Accept the Terms and Privacy Policy to continue." }),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "The passwords do not match." });
    }
    if (value.password.toLowerCase() === value.email) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Do not use your email as your password." });
    }
  });

export type SignupInput = z.infer<typeof signupSchema>;
