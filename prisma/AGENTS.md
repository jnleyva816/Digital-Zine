# prisma: notes

Any schema change needs the owner's approval first. Keep changes additive, so the old and new code both work during a deploy.

- Core models: `User`, `Board`, `MediaAsset`, `Zine`, `ZinePage`. Every photo and zine has a required `boardId`. The template id is `full-bleed-photo`.
- Production changes ship as migrations. The baseline is `migrations/20261119000000_baseline`. Make one with `npm run db:migrate -- --name <change>`, commit it, and deploy with `npm run db:deploy`. CI runs `npm run db:check-migrations`, which proves the migrations match the schema on fresh and `db push` databases (it builds from the baseline SQL).
- `prisma migrate dev` refuses on the owner's dev database, because that database recorded an older `creator_in_zine_urls`. Generate the SQL with `prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script`. Never reset that database.
- The test reset still uses `db push`. `db push` cannot add the required `boardId` to existing rows, so `migrateToBoards` (`src/lib/board/board-migration.ts`) runs first. `npm run db:push`, `db:setup`, and the test reset already do this. Never run a bare `prisma db push` on a database with data.
- Prisma engines are 6.19.3. If Prisma cannot open `libquery_engine.node`, Nix garbage-collected the engines: run `nix build --no-link nixpkgs#prisma-engines_6`.
