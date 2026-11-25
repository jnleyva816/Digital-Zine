# Plans and billing

Decided: owner, 18 to 20 Nov 2026, DIG-11, DIG-15, DIG-16.

- Stripe subscriptions only: Free, and Pro at $15 a month. PDF export is Pro-only. The board, the template, and the public viewer stay on Free.
- A missing `STRIPE_SECRET_KEY` must explain that billing is not configured, not crash.
- `/billing` opens the Stripe Customer Portal. `active`, `trialing`, and `past_due` count as Pro. The plan drops at `unpaid` or `canceled`. Cancelling in the portal keeps Pro until the paid period ends.
- Refunds and risk (`DIG-15`): a full refund of a subscription's latest payment cancels it (Free). A partial refund, or a refund of an older payment, does nothing. A dispute or an early fraud warning only alerts Sentry.
- Sales tax (`DIG-16`): exclusive, and only when `STRIPE_AUTOMATIC_TAX=true`. Never enable it unconditionally.
- Admins cannot start Checkout (see 0005).
