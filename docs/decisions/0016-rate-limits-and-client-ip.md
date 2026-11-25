# Rate limits and the client IP

Decided: owner, 19 Nov 2026.

- A Postgres `RateLimit` table. No limiter dependency.
- Failed sign-ins: 5 per email and 20 per IP per 15 minutes, counted per email and IP together. Uploads: 300 an hour. Writes: 120 a minute. PDF: 10 an hour. Admins are not exempt.
- The client IP is taken `TRUSTED_PROXY_HOPS` entries (default 1) from the right of `X-Forwarded-For`.
