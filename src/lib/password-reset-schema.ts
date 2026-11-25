import { z } from "zod";
import "@/lib/zod-setup";
import { passwordField } from "@/lib/signup";

/** What `/forgot-password` sends (DIG-107). The browser and the server use this one schema. */
export const forgotPasswordSchema = z.object(
  {
    email: z
      .string({ error: "Enter a valid email address." })
      .trim()
      .toLowerCase()
      .max(254, "Enter a valid email address.")
      .email("Enter a valid email address."),
  },
  { error: "Enter a valid email address." }
);

/** What `/reset-password` sends: the link's token and a new password, under sign-up's rules. */
export const resetPasswordSchema = z
  .object({
    token: z.string({ error: "This link is missing its token." }).min(1, "This link is missing its token.").max(200),
    password: passwordField,
    confirmPassword: z.string({ error: "Type the password again." }),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "The passwords do not match." });
    }
  });
