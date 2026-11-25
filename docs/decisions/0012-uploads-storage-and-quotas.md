# Uploads, storage, and quotas

Decided: owner, 18 and 19 Nov 2026, DIG-26, DIG-32.

- Uploads are JPEG only. RAF is not accepted: the X-T5's embedded JPEG is only 13 MP, and the owner shoots RAW+JPEG, so they upload the camera's full 40 MP JPEGs. Up to 75 MB each; storage enforces the limit.
- AVIF only, no WebP. The stored copy is full-resolution AVIF at quality 50 (a 25 MB, 40 MP JPEG became 2.17 MB; see `DIG-26`). Originals are deleted after the recipe, EXIF, and copies are saved. No backfill of photos from before the pipeline; their originals have metadata stripped, not converted.
- Processing runs in the app with `sharp` and a `pg-boss` worker. No RAW develop, and no Python or Rust service.
- Quotas: one 2 GB quota per account, shared by all boards. No per-board cap and no separate Pro cap. Free gets 1 zine and 1 board; Pro gets unlimited zines and boards. The limits live in `src/lib/limits.ts`.
- Deleting a photo is allowed, but `DELETE /api/assets/[id]` returns 409 while a zine page uses it. Stored files are deleted with the photo and with the account (replaces "stored bytes are not deleted"). Uploads that never became a photo are not cleaned up yet.
