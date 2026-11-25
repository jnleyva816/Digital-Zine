# Landing page and sign-up

Decided: owner, 20 Nov 2026, DIG-94, DIG-95.

- `/`: signed-in visitors go to `/board`. Signed-out visitors see the landing page (replaces "no landing page"). Its tiers come from `limits.ts` and `stripe.ts`.
- `/signup` takes name, email, password and confirmation, and a Terms and Privacy checkbox.
- Password accounts verify their email before signing in. Links go through Resend over `fetch`, with no new dependency.
- Google sign-in links to an existing account only when Google reports the email verified.
- `User.passwordHash` is nullable and `googleId` is stored on `User`. There is no Account table or adapter.
- Terms and Privacy are drafts awaiting the owner's review (no contact address or governing law yet).
