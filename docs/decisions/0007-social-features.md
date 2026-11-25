# Social features

Decided: owner, 25 Nov 2026.

- Book mode puts page 1 alone as the cover. Facing pages are a reading layout, not an extra template.
- Additive schema changes for this batch are approved, with Postgres full-text and `pg_trgm` search and the `qrcode` package. No other dependency without asking.
- Comments: verified accounts only, on zines only, with owner delete, an off switch, reports, blocks, and an admin queue. Photos inside a zine can be liked, not commented on.
- Profiles live at `/u/<handle>`.
- Public zines appear in Discover by default, with a per-zine opt-out. Code-protected zines never appear.
- QR codes in the PDF are in scope.
- The editor may autosave drafts (`DIG-62` replaces explicit save once built).
