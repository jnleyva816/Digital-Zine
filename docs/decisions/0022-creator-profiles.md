# Creator profiles and handles

Decided: owner, DIG-111, 26 Nov 2026. Builds on 0007 (profiles at `/u/<handle>`) and 0010 (zine addresses keep `publicId`).

- A handle is optional. A creator has no profile page until they pick one on `/account`. Sign-up does not change.
- A handle can be changed. The old `/u/<old>` address redirects to the new one, and the old handle stays reserved for that creator, so nobody else can take it and inherit their shared links.
- The byline on a public zine links to the creator's profile when they have a handle.
- The profile lists every published zine, newest first. The per-zine opt-out planned for Discover (`DIG-116`) will apply here too once it exists.
- An account can hold at most 5 handles, current and old together. After that, a rename is refused and the creator is told to contact support.
