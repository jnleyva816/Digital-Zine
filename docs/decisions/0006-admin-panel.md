# Admin panel

Decided: owner, 25 Nov 2026, DIG-125.

Replaces "no other users' data, and no admin page" only as far as listed here.

- Admins view users, grant and remove the admin role, deactivate, reactivate, and delete non-admins, see public zines, and see subscriptions read-only with a Stripe link.
- A private zine shows owner, dates, page count, and status only, with no title.
- Deactivating signs the person out, blocks sign-in (they are told only after their credentials are proven), hides their public zines, and cancels a paid subscription at period end. Reactivating does not resume it.
- Deactivating hides zines only. Stored photo files are untouched, so a saved direct photo address keeps working (owner, 25 Nov, DIG-137).
- A subscription that becomes active on a deactivated account, such as from a Checkout opened before it, is set to end at the period end by the billing webhook (owner, 25 Nov, DIG-137).
- An admin's role must be removed before they can be deactivated or deleted. The last active admin is protected.
- Every change needs the password or a sign-in from the last five minutes, and is recorded in `AdminAction` (IDs only).
- Built as `DIG-136` to `DIG-139`, in order, on the `DIG-136` branch with one commit per ticket and one PR.
