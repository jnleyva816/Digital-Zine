# Editor and publishing

Decided: owner, DIG-8.

- Creators have many zines. `/editor` lists them; `/editor/[id]` edits one and saves explicitly (until `DIG-62` adds autosave).
- Publishing needs at least one page and saves pending edits in the same request.
- The slug is editable only until the first publish. `publishedAt` means first published: unpublishing keeps it, and that keeps the slug locked.
- Deleting a zine requires typing its exact title.
