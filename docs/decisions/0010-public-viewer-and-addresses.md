# Public viewer and addresses

Decided: owner, DIG-9, 20 Nov 2026 DIG-102.

- A zine lives at `/z/<creator>/<slug>`. The creator part is `User.publicId`, 8 lowercase characters made by a database default. Slugs are unique per creator, not globally.
- Old `/z/<slug>` links redirect (308) to the new address. If several creators share a slug, the oldest published zine wins.
- A creator-chosen handle was offered and not chosen for addresses (profiles at `/u/<handle>` are 0007).
- The page is one column of `FlipCard`s. The byline is the display name, or nothing. The email never appears.
- Only `published: true` renders; anything else is a 404.
