# Spec 11 — Admin

## Status

Already implemented:

* Admin/developer authorization
* protected `/admin` route
* Admin shell/sidebar/navigation
* environment indicator
* authoritative database-role checks
* durable Admin audit schema/repository/service
* structured audit actions
* audit cursor pagination
* curriculum Admin read model
* curriculum search
* filters
* sorting
* pagination
* supporting indexes

Do **not** rebuild or replace these unless integration with the remaining Admin functionality requires a small extension.

CSV import is no longer part of this spec.

---

# Goal

Complete Polyglot's internal Admin experience for managing official curriculum and development tooling.

Admins must be able to:

* create vocabulary and grammar items
* edit existing curriculum
* preserve published content while preparing edits
* explicitly publish changes
* manage Levels
* manage vocabulary groups/themes
* manage sentences/examples
* manage accepted answers
* manage grammar-specific configuration
* move and reorder curriculum
* detect and resolve duplicates
* archive referenced curriculum safely
* permanently delete only safe unreferenced records
* inspect Audit logs
* inspect selected System logs
* use the isolated developer sandbox

The Admin system must never bypass:

* authoritative role checks
* curriculum validation
* stable curriculum identity
* referential integrity
* audit logging
* sandbox isolation
* cache invalidation
* production-data safety

---

# Routes

Existing Admin shell:

```text
/admin
```

Curriculum:

```text
/admin/curriculum/items
/admin/curriculum/items/new
/admin/curriculum/items/[itemId]

/admin/curriculum/levels
/admin/curriculum/levels/[levelId]

/admin/curriculum/groups
/admin/curriculum/groups/[groupId]
```

Operational tooling:

```text
/admin/logs
/admin/sandbox
```

There is no:

```text
/admin/imports
```

route.

---

# Authorization

Roles remain:

```text
user
admin
beta-tester
developer
```

The Polyglot database is authoritative.

## Admin

May access:

* curriculum editing
* Levels
* groups/themes
* sentences/examples
* accepted answers
* grammar configuration
* ordering
* duplicate resolution
* publication
* archive/delete workflows
* Audit logs
* System logs
* sandbox

## Developer

May access:

* sandbox
* approved technical diagnostics
* approved System logs

A developer cannot modify official curriculum unless the account also has the `admin` role.

Every mutation must recheck authorization server-side.

Never trust:

```text
hidden navigation
disabled buttons
client state
Clerk metadata alone
```

---

# Admin Curriculum Table

Continue using the existing real-data curriculum read model.

The table should expose useful fields such as:

```text
Type
Item
Meaning / Description
Language
Level
Group
Order
Status
Updated
Actions
```

Supported filters:

```text
search
language
level
type
status
group/theme
```

Supported sorting:

```text
Level
Curriculum order
Recently updated
Status
Item
```

Use cursor pagination.

Do not load the full curriculum into the browser.

---

# Curriculum Status Model

Use:

```text
Pending
Draft
Published
Archived
```

## Pending

A newly created curriculum item that has never been published.

New items enter:

```text
Pending
```

immediately.

They remain invisible to learners until explicitly published.

## Draft

An unpublished revision of an item that already has a live Published version.

Example:

```text
Published item
→ Edit
→ Save Draft
→ Published version remains live
```

## Published

The authoritative learner-facing curriculum.

## Archived

No longer active curriculum, but retained because historical/current learner state may reference it.

---

# Published Revision Model

The database must reliably distinguish:

```text
what learners currently see
```

from:

```text
what the admin is currently editing
```

Do not implement drafts by mutating the live row and relying on UI state.

Preserve:

```text
stable learning_item identity
+
live published revision
+
unpublished pending/draft revision
```

or an equivalent normalized model.

Editing display content must not create a new `learning_item`.

Existing learner progress stays attached to the stable item ID.

---

# Creating Items

Provide:

```text
Add Item
```

with:

```text
Vocabulary
Grammar
```

New records:

```text
→ Pending
→ Admin completes content
→ validation
→ explicit Publish
```

New content must never become learner-visible just because the create/save request succeeded.

---

# Vocabulary Editor

Support all authoritative vocabulary fields represented by the current curriculum domain.

Expected editable data may include:

```text
language
written/display form
article where modeled
primary translation
accepted official answers
Level
group/theme
curriculum order
lesson priority
teaching meaning
context
creator notes
sentences/examples
resources
status
```

With Spec 12 Lexicon integration, external lexical fields such as:

```text
lemma
POS
IPA
dictionary definitions
forms
variants
dictionary synonyms
regional evidence
```

should eventually resolve from the Lexicon domain rather than being unnecessarily duplicated in Admin curriculum fields.

Do not create fake schema columns merely because a conceptual field exists.

---

# Accepted Vocabulary Answers

Admins manage official accepted answers.

Example:

```text
gato

Accepted:
cat
the cat
```

These are separate from:

```text
user_synonyms
```

Learner-created synonyms remain private learner data.

Dictionary-derived candidate answers from the Lexicon integration may be suggested later, but an admin explicitly chooses which answers become official.

---

# Grammar Editor

The grammar editor must support all currently modeled grammar configuration.

This can include:

```text
grammar name / structure
short translation
short description
full explanation
Level
curriculum order
lesson priority
question types
accepted answers
context
formation
usage notes
sentences/examples
creator notes
resources
status
```

Configured question types remain authoritative for:

```text
Lessons
Reviews
Practice
Item Detail
```

Do not hardcode one grammar exercise type into Admin.

Publishing must validate downstream grammar configuration.

---

# Sentences and Examples

Admins can:

```text
add
edit
remove/archive
reorder
```

official sentences/examples.

Expose at minimum:

```text
target-language sentence
translation
```

plus any other fields actually represented by the sentence schema.

If a sentence is shared by several items, preserve its stable identity.

Do not silently duplicate shared sentence records.

---

# Levels Management

Route:

```text
/admin/curriculum/levels
```

Allow Admin management of configured Level properties such as:

```text
level number
title if supported
description if supported
access tier
status
ordering/configuration
validation state
```

Show curriculum counts.

Current configured expectation:

```text
48 vocabulary
4 vocabulary groups
12 vocabulary per group
12 grammar
```

These are validation rules, not hardcoded schema assumptions.

Example:

```text
Level 8

Vocabulary  47 / 48   ⚠
Grammar     12 / 12   ✓
Groups       4 / 4    ✓
```

Incomplete Pending/Draft Levels may exist.

Publishing should fail if mandatory Level validation is not satisfied.

---

# Vocabulary Groups / Themes

Route:

```text
/admin/curriculum/groups
```

Admins can:

```text
create
edit
archive
reorder
move vocabulary between groups
```

Group IDs remain stable when:

```text
name changes
order changes
Level placement changes
```

---

# Curriculum Ordering

Ordering is explicit.

Support:

```text
Level position
group position
item position inside group
grammar order
lesson priority
```

Do not rely on database insertion order.

Provide a UI-friendly ordering system.

Possible interaction:

```text
drag/drop
+
move up/down
+
numeric position
```

Keyboard-accessible controls are required.

Drag/drop cannot be the only interaction.

---

# Moving Curriculum

Admins can move items between:

```text
Levels
Groups
Themes
```

without changing the permanent item ID.

Example confirmation:

```text
Move "el gato"

Level 2 → Level 3

Existing learner progress remains associated with this item.
```

Moving curriculum must never silently reset progress.

---

# Publication

Publishing is explicit.

Before publishing, validate:

```text
required fields
relationships
Level
group
duplicate state
ordering
grammar configuration
sentence references
archived dependencies
```

Then:

```text
Publish
→ update authoritative published revision
→ record Audit event
→ invalidate affected curriculum caches
```

Publishing a draft replaces the live content associated with the same stable curriculum identity.

It does not create a new learner-progress identity.

---

# Publish Impact

For consequential edits, show useful impact information.

Example:

```text
Publish changes to "gato"?

184 learner progress records currently reference this item.

Their progress will remain intact.
The displayed curriculum content will change.

[Cancel] [Publish]
```

Do not expose individual learner information.

Only aggregate impact counts where useful.

---

# Concurrency Protection

Prevent two Admin sessions from silently overwriting each other.

Use the current revision/version or `updated_at` value.

Conceptually:

```text
Admin A loads version 5
Admin B publishes version 6
Admin A attempts save using version 5
→ ADMIN_EDIT_CONFLICT
```

Return:

```text
This item changed after you opened it.

Reload the latest version before saving or publishing.
```

Do not use silent last-write-wins behavior for curriculum.

---

# Archive / Delete

The Admin UI may expose:

```text
Delete
```

but actual behavior depends on referential integrity.

## Referenced Item

If progress/history or another required record references it:

```text
Delete request
→ Archive
```

Example:

```text
This item has existing learner progress and cannot be permanently deleted.

It will be archived instead.
```

Existing progress must remain valid.

## Unreferenced Item

Permanent deletion is permitted only when database relationships prove nothing depends on it.

Examples more likely to qualify:

```text
unused Pending item
unused Draft record
unused group
```

All destructive actions require explicit confirmation.

---

# Duplicate Detection

Duplicate detection is required during:

```text
manual creation
manual editing
```

Comparison is language-scoped.

Normalize:

```text
leading/trailing whitespace
case
Unicode representation
```

Do not remove meaningful accents.

Therefore:

```text
Gato
gato
 GATO
```

are duplicate candidates.

But:

```text
si
sí
```

remain distinct.

---

# Duplicate Resolution

An exact normalized match must not silently create another curriculum record.

Show the matching item.

Allow:

```text
Cancel
Use existing item
Edit new item
Approve separate sense / homonym
```

Homonym approval must be explicit and audited.

Suspicious near-duplicates may generate warnings rather than hard failures.

Examples:

```text
accent-only difference
similar spelling
same meaning with near-identical form
```

The Admin makes the final decision.

---

# Bulk Actions

The existing curriculum table may support:

```text
Archive selected
Move to Level
Move to group
Publish selected Pending items
```

Each item still requires normal validation.

Do not add broad unsafe bulk permanent-delete behavior.

---

# Bulk Publish

Pending items may be selected and published together.

Before commit:

```text
validate all items
validate relationships
validate duplicates
validate affected Levels
```

The publication operation should be transactional:

```text
all selected publish
```

or:

```text
none publish
```

after an unexpected database failure.

---

# Audit Logs

Route:

```text
/admin/logs
```

Tabs:

```text
Audit
System
```

Default:

```text
Audit
```

The existing durable Audit foundation remains authoritative.

Every Admin mutation must record:

```text
actor
action
resource type
resource ID
timestamp
before metadata
after metadata
reason when required
correlation ID where useful
```

Actions include:

```text
CURRICULUM_ITEM_CREATED
CURRICULUM_ITEM_UPDATED
CURRICULUM_ITEM_PUBLISHED
CURRICULUM_ITEM_ARCHIVED
CURRICULUM_ITEM_DELETED
CURRICULUM_ITEM_MOVED
CURRICULUM_ITEM_REORDERED

LEVEL_UPDATED

GROUP_CREATED
GROUP_UPDATED
GROUP_ARCHIVED

DUPLICATE_APPROVED

SANDBOX_RESET
SANDBOX_STAGE_CHANGED
SANDBOX_TIME_CHANGED
```

Use cursor pagination.

Filters:

```text
actor
action
resource type
date range
resource/search
```

---

# System Logs

The System tab provides a useful operational view, not an internal replacement for Sentry.

May expose safely structured events such as:

```text
errors
warnings
curriculum failures
lesson failures
review failures
rate-limit events
```

Do not expose:

```text
tokens
passwords
sessions
private notes
journal text
typed learner answers
microphone data
database credentials
provider secrets
```

Sentry remains responsible for:

```text
full exception investigation
stack traces
performance investigation
release diagnostics
issue grouping
```

---

# Developer Sandbox

Route:

```text
/admin/sandbox
```

Allowed roles:

```text
admin
developer
```

A developer without Admin rights may use the sandbox but cannot mutate official curriculum.

The sandbox continues using the existing isolated-user model:

```text
users.is_sandbox
users.sandbox_owner_user_id
clerk_user_id = null
```

Do not add `is_sandbox` flags throughout progress tables.

---

# Sandbox Controls

Provide controls for:

```text
simulate curriculum Level
set arbitrary sandbox SRS stages
make sandbox reviews due
unlock practice
unlock tests
inspect unlock behavior
view onboarding
preview animations
simulate future time
reset sandbox
open sandbox learner experience
```

Example:

```text
Sandbox

Level               [12 ▼]
SRS stage           [Familiar 1 ▼]
Reviews             [Make Due]
Practice            [Unlock]
Tests               [Unlock]
Time                 [+7 Days]

[Open Sandbox]
[Reset Sandbox]
```

---

# Sandbox Isolation

Sandbox actions must never modify:

```text
real admin learner progress
other users
other sandboxes
official curriculum
server/global time
production learner data
```

Time simulation uses a sandbox-specific clock abstraction.

Example:

```text
real server time: unchanged
sandbox perceived time: +7 days
```

Reset clears only the current owner's sandbox state.

---

# Environment Safety

Development, Preview, and Production remain isolated.

Non-production Admin pages should visibly display:

```text
DEVELOPMENT
```

or:

```text
PREVIEW
```

Production credentials and learner data must never be copied into non-production environments.

Sandbox isolation is not a substitute for environment isolation.

---

# Cache Invalidation

Official curriculum mutations must invalidate affected cache tags.

Includes:

```text
publish
archive
delete
move
reorder
group changes
Level changes
```

Avoid broad global invalidation where a targeted cache tag is sufficient.

Published learner pages should reflect successful Admin publication without waiting for an arbitrary stale TTL.

---

# Mutation Safety

High-impact operations should use idempotency where retries could duplicate effects.

Examples:

```text
Publish
Archive
Delete
Bulk reorder
Bulk publish
```

A repeated operation with the same idempotency key and payload must not:

```text
publish twice
create duplicate Audit events
apply the move twice
```

Admin mutations should use the existing rate-limit provider.

Suggested policies:

```text
admin-mutation
admin-publish
sandbox-mutation
```

Thresholds belong in configuration.

---

# Validation

Use runtime validation for:

```text
forms
route params
server actions
API requests
publication
bulk operations
sandbox mutations
```

TypeScript types alone are insufficient.

Expected structured errors include:

```text
UNAUTHENTICATED
FORBIDDEN

ADMIN_EDIT_CONFLICT

CURRICULUM_ITEM_NOT_FOUND
CURRICULUM_VALIDATION_FAILED

DUPLICATE_ITEM
DUPLICATE_REVIEW_REQUIRED

ITEM_REFERENCED

SANDBOX_NOT_FOUND
SANDBOX_OPERATION_FORBIDDEN

RATE_LIMITED
```

Never expose:

```text
SQL errors
stack traces
internal DB structures
secrets
```

to the browser.

---

# Database Changes

Use additive Drizzle migrations only.

The remaining implementation may require schema for:

```text
curriculum revisions
published/draft relationships
pending publication
revision versions
```

Do not modify previously applied migrations.

Preserve:

```text
learning_items.id
```

as the permanent curriculum identity.

Admin workflow tables must not become authoritative for learner progress.

---

# Domain Boundaries

`admin` owns:

```text
Admin workflow orchestration
publication workflow
Audit events
duplicate resolution
sandbox administration
```

`curriculum` owns:

```text
curriculum structure
validation
stable item identity
Levels
groups
vocabulary
grammar
sentences
ordering
```

`srs` owns SRS.

`progress` owns learner progress.

Admin calls these domains.

It must not duplicate their business rules.

---

# UI Requirements

The Admin interface is desktop-first and information-dense.

Prioritize:

```text
tables
filters
forms
side navigation
efficient editing
```

Still support tablet/mobile.

Smaller layouts may:

* collapse sidebar navigation
* place filters inside a sheet/dialog
* switch table rows to cards
* use single-column forms

Basic Admin functionality must not require horizontal scrolling where avoidable.

---

# Accessibility

Required:

* keyboard navigation
* visible focus
* labeled filters
* accessible sortable table headers
* modal focus trapping
* non-color status indicators
* accessible confirmation dialogs
* keyboard ordering alternatives
* readable validation summaries

Drag-and-drop must always have a non-drag alternative.

---

# Performance

Keep Admin ordinary but efficient.

Required:

* cursor pagination
* indexed filters/search
* explicit selected DB columns
* no N+1 query patterns
* server components where practical
* no loading the whole curriculum client-side
* no loading entire Audit history
* no learner request blocked on Admin observability

---

# Suggested Remaining Code Shape

Use the existing Admin implementation and extend it rather than replacing it.

Conceptually:

```text
app/(admin)/admin/
  curriculum/
    items/
      new/
      [itemId]/
    levels/
      [levelId]/
    groups/
      [groupId]/

  logs/
  sandbox/

components/admin/
  curriculum/
    curriculum-editor.tsx
    vocabulary-editor.tsx
    grammar-editor.tsx
    sentence-editor.tsx
    ordering-editor.tsx
    publish-dialog.tsx
    archive-dialog.tsx
    duplicate-review.tsx

  logs/
    audit-log-table.tsx
    system-log-table.tsx

  sandbox/
    sandbox-controls.tsx
    sandbox-status.tsx

domains/admin/
  authorization.ts           # existing
  audit-service.ts           # existing
  publication-service.ts
  duplicate-review.ts
  sandbox-service.ts
  server.ts
```

Do not keep unused CSV/import modules in the Admin implementation.

---

# Out of Scope

Do not implement:

* CSV curriculum import
* arbitrary real-user progress inspection
* arbitrary real-user SRS editing
* manually unlocking real learner Levels
* user impersonation
* Clerk Admin UI
* billing administration
* PostHog dashboard
* Sentry replacement
* AI curriculum publication
* raw SQL Admin console
* production database browser
* unrestricted environment switching

---

# Final Verification

After the remaining Admin implementation is complete, run one complete verification pass.

## Static

Run:

```text
npm run typecheck
npm run lint
npm run build
```

All must pass.

Run the project's normal test suite as well.

---

## Admin Authorization Regression

Although the initial authorization work already exists, confirm it was not broken:

```text
normal user
→ /admin
→ denied

admin
→ full Admin access

developer
→ Logs/Sandbox
→ curriculum mutation denied

admin + developer
→ full Admin access
```

Also call protected mutation endpoints directly.

Do not rely only on navigation visibility.

---

## Curriculum CRUD

Verify:

```text
create vocabulary
→ Pending

create grammar
→ Pending

edit Pending item
→ stays unpublished

publish
→ becomes learner-visible
```

Verify:

* vocabulary fields
* accepted answers
* grammar configuration
* sentences
* examples
* Levels
* groups
* ordering

---

## Published Revision Test

Critical flow:

```text
Published item A
→ learner reads version A

Admin edits A
→ Save Draft

learner still reads version A

Admin publishes

learner now reads version B
```

Verify:

```text
learning_item ID unchanged
learner progress unchanged
```

---

## Concurrency Test

```text
Admin A opens item
Admin B publishes change
Admin A saves stale version
→ ADMIN_EDIT_CONFLICT
```

The stale Admin must not overwrite the current version.

---

## Archive/Delete Test

Referenced:

```text
Published vocabulary
→ learner progress exists
→ Delete
→ Archive
→ progress remains
```

Unreferenced:

```text
unused Pending item
→ Delete
→ permanent deletion
```

---

## Duplicate Test

Verify:

```text
gato vs GATO
→ duplicate candidate

si vs sí
→ distinct

approved homonym
→ separate stable item
→ Audit event
```

---

## Ordering Test

Verify:

```text
move item between groups
move item between Levels
reorder vocabulary
reorder grammar
reorder groups
```

Confirm permanent item IDs remain unchanged.

---

## Publication Validation

Attempt to publish invalid curriculum:

```text
missing required relationship
invalid Level/group
unresolved duplicate
invalid grammar configuration
invalid sentence reference
```

All should fail without altering the published version.

---

## Audit Test

Perform Admin mutations and verify the existing Audit system records:

```text
actor
action
resource
timestamp
before
after
```

Test:

```text
create
edit
publish
move
reorder
duplicate approval
archive/delete
sandbox mutation
```

Verify filtering and cursor pagination.

---

## System Log Privacy

Confirm the System view never displays:

```text
tokens
passwords
sessions
journal text
private notes
typed learner answers
database credentials
```

---

## Sandbox Test

Verify:

```text
change Level
change SRS stage
make review due
simulate future time
unlock Practice/Test
reset sandbox
```

Then verify:

```text
real Admin learner state unchanged
other users unchanged
official curriculum unchanged
```

---

## Idempotency / Replay

Replay:

```text
Publish
Archive
Delete
Bulk publish
```

with the same idempotency key.

Verify the effect occurs exactly once.

---

## Responsive / Accessibility

Check:

```text
desktop
tablet
mobile
keyboard-only
```

Verify:

* sidebar
* filters
* editors
* confirmations
* reorder controls
* focus behavior
* status labels

---

## Full Regression

Finally run the complete existing project suite so the Admin changes do not break:

```text
authentication
curriculum reads
lessons
reviews
progress
Levels
database migrations
production build
```

Only after the final run passes:

```text
update progress-tracker.md
update architecture.md if implementation decisions changed architecture
```

---

# Completion Criteria

Spec 11 is complete when:

1. The already-built Admin authorization, shell, audit foundation, and curriculum read model remain functional.
2. Admins can create Vocabulary items.
3. Admins can create Grammar items.
4. New items enter Pending.
5. Admins can edit Pending items.
6. Published items can have unpublished Draft revisions.
7. Draft changes never modify learner-visible content before Publish.
8. Publishing explicitly promotes the intended revision.
9. Stable `learning_item` IDs survive edits.
10. Existing learner progress survives edits and moves.
11. Admins can manage accepted vocabulary answers.
12. Admins can manage grammar configuration.
13. Admins can manage sentences/examples.
14. Admins can manage Levels.
15. Admins can manage vocabulary groups/themes.
16. Admins can reorder curriculum.
17. Admins can move items without recreating identity.
18. Duplicate detection is language-aware.
19. Accents remain semantically meaningful.
20. Homonyms can be explicitly approved.
21. Referenced curriculum archives instead of being destroyed.
22. Only provably unreferenced curriculum can be permanently deleted.
23. Publication validates affected curriculum before changing live data.
24. Concurrent Admin edits cannot silently overwrite each other.
25. Admin mutations create Audit events.
26. Audit logs remain filterable and cursor-paginated.
27. System logs expose useful diagnostics without sensitive data.
28. Admin does not attempt to replace Sentry.
29. Admins and developers can use the isolated sandbox according to role.
30. Sandbox state cannot modify real learner state.
31. Sandbox time is isolated.
32. Curriculum mutations invalidate affected caches.
33. High-impact mutations tolerate retry without duplicate effects.
34. Unauthorized direct Admin mutations fail server-side.
35. CSV import does not exist in this Admin implementation.
36. Typecheck passes.
37. Lint passes.
38. Tests pass.
39. Integration tests pass.
40. Browser verification passes.
41. Production build passes.
42. `progress-tracker.md` is updated.
43. New durable architecture decisions are recorded in `architecture.md`.
