# Private zines with an access code

Decided: owner, DIG-112, 26 Nov 2026. Builds on 0009 (publishing) and 0010 (only published zines render).

- Private is a setting on a zine, next to Public; publishing does not change. A private zine is still `published: true` at the same address, and its slug stays locked once published.
- The creator picks the code: 6 to 64 characters, spaces around it ignored. Only a bcrypt hash is stored. Making a zine public forgets its code.
- A right code gives the reader a signed, HttpOnly cookie for that one zine's page, valid for 30 days. A new code, or turning the zine private again, ends every earlier unlock.
- Tries are limited to 10 per IP and 30 wrong ones per zine, each in 15 minutes.
- Until a reader unlocks it, a private zine's page carries no title, description, photo, or share image, and it is always noindex. Private zines are never listed in the sitemap, on profiles, in Discover, or by the old `/z/<slug>` redirect.
- Photo files stay at unguessable but public addresses. The editor says so: a code locks the page, not a photo address someone already has.
