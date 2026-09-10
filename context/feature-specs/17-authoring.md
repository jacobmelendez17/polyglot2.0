# Curriculum Authoring & Verification

Drafted by Claude on 2026-09-09 from a spoken request, following the four
decisions the user made the same day. Edit freely — this is the source of
truth, not a record of what Claude intends.

## Goal

Make curriculum content genuinely authorable:

* a teaching meaning that comes from the dictionary but can be edited
* per-word usage contexts, so a learner sees examples grouped by how the
  word is actually used
* re-importing a corrected CSV updates the words that already exist
* a `writer` role that can author curriculum, with Admin verifying
  everything before a learner sees it

## Teaching Meaning

The teaching meaning stays dictionary-backed by default. Confirming a
dictionary match writes the matched sense into the item — already
implemented, see `architecture.md`'s Lexicon section.

Add an **edit** control for it in the item editor. Today the field is
read-only whenever a mapping is confirmed, which means approving a match
locks the field it just filled.

### Manual override

Editing a dictionary-supplied field marks that field **manually authored**.

A manually authored field is never overwritten again by:

* confirming or re-confirming a mapping
* changing the selected sense or preferred pronunciation
* a dictionary re-import
* a curriculum re-import

Each overridable field carries its own mark. Editing the teaching meaning
must not freeze the IPA.

Provide **Reset to dictionary** per field. It clears the mark and re-applies
the current dictionary value.

The editor must always show which of the two a field currently is, and what
the dictionary would say instead.

Applies to exactly the fields a confirmed match supplies: teaching meaning,
part of speech, IPA. The term and the primary meaning are never
dictionary-supplied and are always authored.

## Usage Contexts

A vocabulary item has an ordered list of **usage contexts**. Each has a
label, an optional note, and its own ordered examples.

On the learner's word page, the Context section becomes one tab per usage
context:

```text
comer

[ como ] [ comes ] [ come ] [ General ]

como
  Yo como pan todos los días.     I eat bread every day.
  ¿Como demasiado?                Do I eat too much?
```

### Where the tabs come from

Seed them from the dictionary's imported inflected forms and their
grammatical tags when the item has a confirmed mapping — `dictionary_forms`
already stores `comer` → `como` / `comes` / `come` with tags such as
*first-person singular present*.

Seeding is a starting point, never a constraint:

* labels can be renamed
* contexts can be reordered, added, and deleted
* a word with no dictionary match can still have hand-authored contexts

A usage context is display grouping only. It is not a learning item, it has
no SRS stage, and no progress is tracked per context.

### Editing

Every word gets an editable table of its usage contexts and their examples
in Admin. There is no example-authoring UI at all today — examples exist in
the schema and render to learners, but nothing writes them.

The table must support adding, editing, reordering, and deleting both
contexts and the examples inside them.

Examples that belong to no usage context appear under a default **General**
tab, so nothing authored before this feature is stranded.

Grammar items get example editing too. They do not get usage contexts —
they have no inflected forms and no dictionary integration.

## Curriculum Re-import

Re-importing a file that contains words already in the curriculum must
update them rather than refuse or duplicate.

Match an incoming row to an existing item by language, item type, and
normalized term.

A matched row **updates the existing item in place**. The learning item keeps
its permanent ID, so learner progress, SRS state, review history, and deck
membership all survive — moving or editing an item must never create a new
identity (`architecture.md`, Permanent Identity).

Publication status decides where the update lands:

* `pending` or `draft` — applied directly
* `published` — written into that item's draft, for Admin to publish
* `archived` — reported, never silently revived

Manually authored fields are respected: a re-import does not overwrite them.

**A field the file does not carry is left alone.** An absent column or a
blank cell means "this file says nothing about that", never "clear it". The
authored Level 1 file is four columns wide, so without this rule re-importing
it would blank the article, context, pronunciation, IPA and creator notes of
all 45 words. Accepted answers are untouched for the same reason — a file has
no way to express them.

A file cannot author a homonym. Duplicate detection normalizes the same
display form the same way this matching does, so an identical term can only
mean the same word; a second item with that spelling is created in Admin,
where the two can be told apart.

A term repeated inside one file creates the word once and then updates it,
rather than producing two items.

A row whose level or group differs from the item's current placement is a
**move**, and is reported as one in the preview rather than applied silently.

The preview must state, per row: create, update (with the fields that would
change), move, unchanged, or blocked.

An exact term match is now an update, not a duplicate. Duplicate detection
and the homonym approval it triggers apply only to genuinely different items.

## Levels Are Flexible

A level may hold **any number** of vocabulary items, vocabulary groups, and
grammar items, in any proportion (user decision, 2026-09-09).

There is no count a level must reach and no shape it must have. Publication
is an Admin decision: an Admin publishing a level *is* the approval.

This replaces the original 48 vocabulary / 4 groups / 12 per group / 12
grammar rule, which was enforced as a publish gate with optional per-level
overrides.

Anything needing a level's proportions derives them from its actual contents.
Lesson batches size their grammar share that way, so a level of 200 words and
3 grammar points is paced as what it is — and grammar never takes a whole
batch while vocabulary remains.

### The level page

A level's page is where its curriculum is arranged. It shows every vocabulary
and grammar item the level holds, **in the order lessons will teach them**,
and each item can be:

* reordered, which sets that lesson order
* moved to a different vocabulary group
* moved to a different level

Ordering is one sequence per item type across the level, not per group — the
lesson queue is level-wide, so a per-group order would show an order that
does not exist. Each row names its group instead.

## Roles and Verification

Add a `writer` role.

A writer may:

* reach the Admin curriculum area
* create curriculum items
* edit items, including saving drafts of published ones
* author usage contexts and examples
* work with dictionary mappings

A writer may **not**:

* publish or bulk publish
* archive or delete
* manage levels or vocabulary groups
* reach the Sandbox, Logs, or Imports

Nothing a writer does reaches a learner on its own. New items land `pending`;
edits to published items land in that item's draft. Both require an Admin
publish, which is already how the curriculum status model works.

### Review queue

Admin needs one surface listing everything awaiting verification — pending
items and open drafts together — showing who authored each and when, with
publish available from the list.

Without it "Admin verifies everything" means "Admin remembers to go looking".

Every authoring action is already audited by actor; keep it that way.

## Scope Limits

* no AI-generated examples or definitions
* no per-usage-context SRS, progress, or unlocks
* no audio on examples (the media domain does not exist yet)
* no reviewer comments or send-back workflow — a writer's work is either
  published by Admin or left waiting
* no change to SRS, unlock thresholds, or lesson selection
* usage contexts never become learning items

## Check When Done

* A dictionary-supplied teaching meaning can be edited in Admin.
* An edited field survives re-confirmation, sense changes, and re-imports.
* Reset to dictionary restores the dictionary value.
* Each field's provenance is visible in the editor.
* A word's usage contexts seed from its confirmed dictionary forms.
* Usage contexts and examples can be added, edited, reordered, and deleted.
* The learner's word page shows examples grouped in usage tabs.
* Examples with no context appear under General.
* Re-importing an existing word updates it and preserves its ID and progress.
* Re-importing a published word produces a draft, not a live edit.
* Re-import never overwrites a manually authored field.
* The import preview classifies every row.
* A writer can author curriculum but cannot publish, archive, or delete.
* Admin has a queue of everything awaiting verification.
* A level publishes whatever it contains, with no count to satisfy.
* A level's page lists everything it teaches, in lesson order.
* Items can be reordered, regrouped, and moved between levels from there.
* Tests pass.
* `npm run build` passes.
