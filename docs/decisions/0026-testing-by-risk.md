# Testing by risk

Decided: owner, 28 Nov 2026, DIG-123. Extends [0020](0020-testing.md).

- A change gets the tests its risk calls for, not every suite:

| Change | Test |
| --- | --- |
| Color, spacing, copy | Look at it; `npm run typecheck` for code |
| Button or other UI behavior | One component test |
| Logic | Unit test |
| API route | API tests, including auth and abuse cases |
| Upload, sign-up, publish, viewer, billing, deletion | The above, plus that flow's e2e spec |
| Auth, payments, schema, middleware, dependencies | Everything |

- Purely visual changes (color, spacing, copy) are exempt from test-first. Anything that changes behavior is not.
- Unit and component tests need no database and run in parallel (`npm run test:fast`). API tests reset the test database and run one file at a time (`npm run test:api`).
- CI still runs every suite on every pull request.
