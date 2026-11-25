# Testing

Decided: owner, 18 Nov 2026; changed 25 Nov 2026, DIG-122.

- Test-driven: red, green, refactor. Vitest, Testing Library, jsdom, and Playwright.
- Tests use `digital_zine_test` from `.env.test`, never the dev database.
- Targeted tests locally, the full suite in CI, and a full local run only at milestones and for the high-risk changes listed in `AGENTS.md`.
- A ticket is Done when the owner merges it into `main` or closes it.
