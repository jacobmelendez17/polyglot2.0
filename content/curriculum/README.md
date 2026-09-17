# Authored Curriculum

Polyglot-authored curriculum source files, one CSV plus one manifest per
level. This is **authoring input**, not a runtime data source: nothing in
the application reads this directory. `npm run curriculum:import` loads a
file from here once, writes real rows through the normal
`domains/admin`/`domains/curriculum` import path, and from then on every
application read comes from the database (spec 16, "Do not use the CSV as a
runtime data source").

Deliberately separate from [`/data-sources`](../../data-sources), which
holds _third-party_ lexical data under its own licences.

## The CSV

Same column contract as the Admin bulk-import dialog
(`domains/curriculum/vocabulary-import-parsing.ts`):

| Column        | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `word`        | The vocabulary term, or the grammar structure                           |
| `translation` | The primary meaning                                                     |
| `level`       | Plain level number (`1`, not a UUID)                                    |
| `batch_id`    | Vocabulary group position 1–4 within that level, **or `5` for grammar** |

`batch_id` is an accepted spelling of the `group` column. Group `5` is the
grammar sentinel — grammar items have no vocabulary group at all, so one
out-of-range group number doubles as the item type.

Optional columns (`part_of_speech`, `article`, `definition`,
`pronunciation`, `ipa`, `context`, `creator_notes`) may be added per row;
everything left blank is authored afterwards in Admin.

## The manifest

The CSV carries no theme names, level names, or curriculum targets, so the
manifest supplies them:

- `themes` — the display name for each `batch_id`, in position order. These
  are the names a learner sees in Theme mode.

A level holds whatever it holds — there are no per-level item targets, and
publishing is an Admin decision (spec 17).

## Importing

```bash
npm run curriculum:import -- --actor <admin user id or Clerk id> --dry-run
npm run curriculum:import -- --actor <admin user id or Clerk id>
```

An actor is required and must be an existing `admin`/`developer` user: every
row it creates is a real, audited admin curriculum mutation. Run `--dry-run`
first — it resolves everything and reports duplicates and row problems
without writing.

Re-running the same file is a replay, not a second import: every write is
keyed by the file's content hash. The re-run's preview still lists each row
as a duplicate of the copy the first run created — that is the preview
describing the database, not a second import happening.

Imported items are created **Pending**. The import never publishes
curriculum; an admin does that from `/admin/curriculum` after review.
Imported vocabulary is run through Lexicon dictionary matching immediately
after the write, so ambiguous words land in the existing Admin dictionary
review queue. Grammar bypasses dictionary mapping entirely.
