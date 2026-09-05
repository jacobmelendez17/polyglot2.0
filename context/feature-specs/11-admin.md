# Spec 11 — Admin

> **Scope change (2026-09-05):** CSV bulk import is no longer part of this
> spec — decided unnecessary; official curriculum is authored directly
> through the Admin curriculum editors instead. This removes Units 9-10,
> the `/admin/imports` route, and every CSV-specific requirement below.
> Sections describing the CSV workflow in detail (formerly §36-45) are
> replaced with a short pointer rather than deleted outright, so the
> original numbering stays stable. Scattered CSV mentions inside long
> test-checklist sections elsewhere in this file are vestigial and can be
> ignored. See `progress-tracker.md` for the decision record.

## 1. Goal

Build Polyglot’s internal administrative interface for managing official curriculum and development tooling.

The Admin area provides authorized staff with a UI-friendly way to:

* browse official curriculum
* search and filter curriculum
* create curriculum records
* edit curriculum records
* archive curriculum records
* permanently delete safe, unreferenced records
* reorder curriculum
* manage Levels
* manage vocabulary groups/themes
* manage vocabulary data
* manage grammar data
* manage sentences and examples
* manage accepted answers
* detect and resolve duplicate candidates
* inspect administrative audit logs
* inspect selected operational/system logs
* use the isolated developer sandbox

The Admin area must never provide a shortcut around:

* authoritative role checks
* curriculum validation
* referential integrity
* audit logging
* sandbox isolation
* cache invalidation
* production data safety

---

# 2. Route Structure

Use a dedicated protected route group.

Recommended routes:

```text
/admin
/admin/curriculum
/admin/curriculum/items
/admin/curriculum/levels
/admin/curriculum/groups
/admin/logs
/admin/sandbox
```

Optional item-specific routes:

```text
/admin/curriculum/items/new
/admin/curriculum/items/[itemId]
/admin/curriculum/levels/[levelId]
/admin/curriculum/groups/[groupId]
```

The exact route nesting may be adjusted if the implementation benefits from another clean App Router structure.

Do not expose Admin pages through normal learner URLs.

---

# 3. Roles and Permissions

Polyglot already defines separate application roles including:

```text
user
admin
beta-tester
developer
```

The database is authoritative for roles.

Clerk metadata may assist with presentation, but it must never be trusted as the final authorization source for administrative mutations.

---

# 4. Permission Model

Use the following authorization model.

## Admin

An `admin` can access:

* curriculum management
* Levels management
* vocabulary groups/themes
* vocabulary editing
* grammar editing
* sentences/examples
* accepted answers
* ordering
* duplicate resolution
* publishing
* archiving/deletion workflows
* audit logs
* selected system logs
* developer sandbox

## Developer

A `developer` can access:

* developer sandbox
* selected developer diagnostics
* selected system logs where appropriate

A `developer` cannot modify official curriculum unless that account also has the `admin` role.

## Admin + Developer

An account may hold both roles.

Do not encode roles as mutually exclusive unless the existing user-role implementation already requires it.

---

# 5. Authorization Requirements

Every Admin route must verify access server-side.

Every administrative mutation must independently verify authorization.

Never rely solely on:

```text
hidden navigation
client-side route guards
React state
Clerk metadata
disabled buttons
```

Server mutation flow:

```text
request
→ authenticate
→ resolve internal Polyglot user
→ verify authoritative DB role
→ validate input
→ execute domain operation
→ write audit event
→ invalidate affected cache
→ respond
```

An unauthorized request returns a structured:

```text
FORBIDDEN
```

error.

Administrative authorization must be rechecked for every mutation.

---

# 6. Admin Layout

Use a dedicated Admin shell.

Suggested desktop layout:

```text
┌───────────────────────────────────────────────────────────────────┐
│ Polyglot Admin                                      Jacob / Exit  │
├────────────────┬──────────────────────────────────────────────────┤
│                │                                                  │
│ Overview       │                                                  │
│ Curriculum     │                  Content                         │
│ Logs           │                                                  │
│ Sandbox        │                                                  │
│                │                                                  │
└────────────────┴──────────────────────────────────────────────────┘
```

Primary navigation:

```text
Overview
Curriculum
Logs
Sandbox
```

Curriculum may expose secondary navigation for:

```text
Items
Levels
Groups / Themes
```

Keep the Admin interface functional and information-dense.

It does not need the same cozy learner-facing presentation density as the main application.

It should still reuse Polyglot typography, semantic tokens, components, and overall design language.

---

# 7. Admin Overview

Route:

```text
/admin
```

Provide a concise operational overview.

Possible cards:

```text
Published Items
Pending Items
Draft Items
Archived Items
Duplicate Warnings
```

Also provide quick actions:

```text
Add Item
Manage Levels
View Audit Log
Open Sandbox
```

Do not turn the overview into a full analytics dashboard.

Its purpose is navigation and administrative awareness.

---

# 8. Curriculum Management

Primary route:

```text
/admin/curriculum/items
```

The main curriculum interface should be a UI-friendly administrative table.

This is not the same UI as the learner-facing Levels page.

The Admin table prioritizes:

* scanning
* sorting
* filtering
* editing
* batch workflows
* status visibility

---

# 9. Curriculum Table

Example:

```text
Search...          Language ▼  Level ▼  Type ▼  Status ▼  Group ▼

┌──────┬──────────────┬──────────────┬────────┬───────┬────────────┬───────────┐
│ Type │ Item         │ Meaning      │ Level  │ Group │ Status     │ Actions   │
├──────┼──────────────┼──────────────┼────────┼───────┼────────────┼───────────┤
│ Vocab│ el gato      │ cat          │ 1      │ Food? │ Published  │ Edit ···  │
│ Gram │ porque       │ because      │ 2      │ —     │ Draft      │ Edit ···  │
└──────┴──────────────┴──────────────┴────────┴───────┴────────────┴───────────┘
```

Possible visible columns:

* type
* item
* short translation/description
* language
* level
* group/theme
* order
* lifecycle status
* updated date
* actions

Do not expose unnecessary internal columns such as raw foreign-key IDs by default.

---

# 10. Curriculum Table Filtering

Support at minimum:

```text
search
language
level
item type
status
vocabulary group/theme
```

Statuses:

```text
draft
pending
published
archived
```

`pending` is introduced by this spec as the administrative review state for imported or staged curriculum awaiting manual publication.

If the existing lifecycle implementation prefers to model this as a publication workflow rather than a raw `learning_items.status` enum value, the domain may represent it differently internally.

The UI behavior remains:

```text
not live
validated or awaiting review
must be manually published
```

---

# 11. Search

Admin content search should support useful curriculum fields.

Vocabulary examples:

```text
gato
cat
el gato
```

Grammar examples:

```text
porque
because
cause/reason
```

Search must be language-scoped where appropriate.

Do not erase meaningful accents during matching logic.

For duplicate normalization:

```text
Gato
gato
 GATO 
```

may normalize together.

But:

```text
si
sí
```

remain different written forms.

---

# 12. Pagination

Administrative curriculum lists must be paginated.

Do not load the entire curriculum table into the browser.

Use:

```text
keyset / cursor pagination
```

for unbounded administrative content lists.

Return an opaque cursor rather than raw database offsets or internal ordering keys.

---

# 13. Sorting

Support useful sorting such as:

```text
Level
Curriculum order
Recently updated
Status
Item
```

Any database field introduced for filtering or sorting must have an appropriate supporting index when needed.

Do not ship an expensive admin query without indexing it.

---

# 14. Curriculum Item Types

The Admin system must support at minimum:

```text
Vocabulary
Grammar
```

Both retain stable permanent `learning_item` identity.

Editing or moving an item must not create a new learning item ID.

Existing user progress remains associated with that stable item identity.

---

# 15. Add Curriculum Item

Provide an:

```text
Add Item
```

action.

The admin chooses:

```text
Vocabulary
Grammar
```

before entering type-specific fields.

New items default to:

```text
pending
```

They are not automatically exposed to learners — they remain pending until an admin explicitly publishes them (spec 11 §29). This resolves the previous open question about whether "Pending" has any entry path besides CSV import (now cut, see the 2026-09-05 scope decision): every newly created item enters Pending directly, regardless of how it was created.

---

# 16. Vocabulary Editor

The vocabulary editor should support all authoritative vocabulary data currently defined by the curriculum schema/domain.

Fields may include:

```text
language
written form
article
primary meaning
accepted meanings
part of speech
level
vocabulary group/theme
curriculum order
lesson priority
context
explanation / creator notes
pronunciation / IPA
sentences/examples
resources
lifecycle status
```

Only include fields actually supported by the domain/schema.

Do not create fake data columns merely because they appear in this conceptual list.

---

# 17. Accepted Vocabulary Answers

Admins can manage accepted official answers for vocabulary items.

Examples:

```text
cat
the cat
feline
```

depending on the intended curriculum configuration.

Official accepted answers are distinct from:

```text
user_synonyms
```

Learner-specific synonyms remain private learner content.

Do not mix them into official curriculum records.

---

# 18. Grammar Editor

The grammar editor should support all grammar-specific curriculum configuration.

Possible data includes:

```text
name / grammar structure
short translation
short description
full explanation
level
curriculum order
lesson priority
question types
accepted answers
context
formation / structure
usage notes
sentences/examples
creator notes
resources
status
```

Configured grammar question types must remain authoritative.

Do not hardcode one grammar quiz format into Admin.

---

# 19. Grammar Configuration

The Admin UI should be capable of editing any grammar data represented by the grammar domain.

This includes configuration needed by:

```text
Lessons
Reviews
Practice
Item detail pages
```

where applicable.

If a grammar configuration field has downstream consequences, validation must verify that publishing it will not create invalid lesson/review configuration.

---

# 20. Sentences and Examples

Admins can manage example sentences linked to curriculum items.

Support:

```text
add
edit
remove/archive
reorder
```

Each sentence may include whatever fields are already defined by the sentence schema.

At minimum the UI should expose the learner-facing sentence text and translation if present.

Sentence records used by multiple items should preserve stable identity rather than being silently duplicated.

---

# 21. Levels Management

Route:

```text
/admin/curriculum/levels
```

Admins can manage curriculum Level configuration.

Example table:

```text
Level   Vocabulary   Grammar   Access   Status
1       48           12        Free     Published
2       48           12        Free     Published
3       48           12        Free     Published
4       48           12        Premium  Draft
```

Level management may include:

* level number
* learner-facing title where configured
* description where configured
* curriculum status
* access tier
* ordering/configuration
* validation summary

---

# 22. Level Validation

Current default curriculum expectations are:

```text
48 vocabulary items per level
4 vocabulary groups
12 vocabulary items per group
12 grammar items per level
```

These are validation/configuration rules rather than rigid schema assumptions.

Show validation status to the admin.

Example:

```text
Level 8

Vocabulary: 47 / 48 ⚠
Grammar:    12 / 12 ✓
Groups:      4 / 4  ✓
```

Do not prevent drafts from being temporarily incomplete.

Publishing may be blocked when required curriculum validation fails.

---

# 23. Vocabulary Groups / Themes

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
move items into/out of groups
```

Example:

```text
Level 3

1. Days of the Week
2. Household Items
3. Staple Foods
4. Transportation
```

Group identity should remain stable when its display name or order changes.

---

# 24. Item Ordering

Admins must be able to modify curriculum order.

Ordering includes, where applicable:

```text
Level position
Vocabulary group order
Item order inside group
Grammar order
Lesson priority
```

Do not rely on database insertion order.

The authoritative order is explicitly stored.

---

# 25. Reordering UI

Use a UI-friendly reorder mechanism.

Possible interactions:

```text
drag and drop
move up/down
numeric position
```

Drag-and-drop may be the primary desktop interaction, but keyboard-accessible alternatives are required.

Never make drag-and-drop the only way to change ordering.

---

# 26. Moving Existing Items

Admins may move items between:

```text
Levels
Groups
Themes
```

without changing the item's permanent ID.

Before committing a move, show meaningful downstream implications when relevant.

Example:

```text
Move "el gato"
Level 2 → Level 3

Existing learner progress will remain attached to this item.
```

Moving an item must never silently reset progress.

---

# 27. Draft / Pending / Published / Archived

Administrative curriculum uses these conceptual states:

```text
Draft
Pending
Published
Archived
```

## Draft

An in-progress edit to an already-published item (§28's "Save Draft" step) — the live published version is untouched while the draft is being worked on. New items do not pass through this state (see Pending).

## Pending

Content staged and awaiting manual review and publication, with no live counterpart yet. Every newly created item enters this state directly (§15, confirmed 2026-09-05) rather than starting as Draft, since there is no existing published version to protect a draft against.

## Published

Live official curriculum.

## Archived

No longer offered as active curriculum but still preserved for historical and progress references.

---

# 28. Editing Published Curriculum

Editing already-published content must not immediately alter live curriculum.

Use an explicit workflow:

```text
Published item
→ Edit
→ Save Draft
→ review changes
→ Publish
```

The published version remains authoritative until the admin explicitly publishes the change.

Do not make every keystroke or Save action live.

---

# 29. Publishing

Publishing is an explicit administrative action.

Before publication:

```text
validate curriculum record
validate relationships
validate duplicates
validate required fields
validate ordering
validate grammar configuration where relevant
```

Then:

```text
publish
→ write authoritative curriculum state
→ write audit event
→ invalidate affected curriculum caches
```

Curriculum cache invalidation is mandatory after an administrative change.

---

# 30. Publish Confirmation

For normal low-risk edits, a concise confirmation is sufficient.

For high-impact changes, show more context.

Example:

```text
Publish changes to "gato"?

This item is currently used by 184 learner progress records.
Publishing will change the curriculum content displayed to those learners.

[Cancel] [Publish]
```

Do not expose sensitive learner information.

Only aggregate impact counts where useful.

---

# 31. Archive / Delete Behavior

The Admin UI may expose an action labeled:

```text
Delete
```

but server-side behavior depends on referential integrity.

## Referenced curriculum

If any user progress, history, or required relationship depends on the item:

```text
Delete
→ Archive
```

Explain this in the confirmation dialog.

Example:

```text
This item has existing learner progress and cannot be permanently deleted.

It will be moved to Archived instead.
```

## Unreferenced curriculum

If referential integrity proves nothing depends on the record, permanent deletion may be allowed.

This follows the existing item lifecycle rule.

---

# 32. Destructive Confirmation

Archive/delete operations require explicit confirmation.

High-risk operations should require stronger confirmation than ordinary edits.

Example:

```text
Archive "gato"?

It will no longer appear in active curriculum.
Existing user progress will remain associated with it.

[Cancel] [Archive]
```

Never silently destroy curriculum.

---

# 33. Duplicate Detection

Duplicate detection is required for:

```text
manual creation
manual editing
```

Comparison is language-scoped.

Normalization may include:

```text
trim whitespace
case normalization
Unicode normalization
```

Do not remove meaningful diacritics.

---

# 34. Duplicate Candidates

If an exact normalized form already exists:

```text
new gato
existing gato
```

do not silently create another official record.

Instead:

```text
flag duplicate
show matching records
require administrative resolution
```

The Admin may:

```text
Cancel
Use existing item
Edit new item
Approve as legitimate separate sense / homonym
```

Homonym approval must be deliberate and audited.

---

# 35. Near-Duplicate Warnings

Suspicious near-matches may also be flagged.

Examples could include:

```text
accent-only differences
very similar spelling
same translation with nearly identical target text
```

A warning does not automatically mean the item is invalid.

The admin makes the final decision.

---

# 36-45. CSV Import (REMOVED)

> Sections 36-45 originally specified the CSV bulk-import workflow (upload,
> parse, validate, preview, duplicate handling, staged commit, import
> history). CSV import was descoped 2026-09-05 — decided unnecessary;
> official curriculum is authored directly through the Admin curriculum
> editors instead. Numbering is kept stable rather than renumbering every
> section below. See `progress-tracker.md` for the decision record.

---


# 46. Audit Logs

Route:

```text
/admin/logs
```

Use tabs:

```text
Audit
System
```

Default:

```text
Audit
```

---

# 47. Audit Log

Every administrative mutation should produce an audit trail.

Record:

```text
actor
action type
target resource type
target resource ID
timestamp
relevant before metadata
relevant after metadata
reason where required
correlation ID where useful
```

Existing required examples include:

```text
Moved learning item from Level 2 to Level 3
Approved duplicate candidate as homonym
Archived curriculum item
Requested progress reset after curriculum change
```

These requirements already exist in the architecture.

---

# 48. Audit Actions

Examples:

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

Use structured action identifiers internally.

The UI may display human-friendly labels.

---

# 49. Audit Log Filtering

Support:

```text
actor
action type
resource type
date range
resource ID/search
```

Use cursor pagination.

Audit logs are unbounded and should not use an unbounded query.

---

# 50. System Logs

The System tab provides a practical view of selected operational application events.

It is not intended to reproduce the entire Sentry product.

Useful categories may include:

```text
errors
warnings
curriculum events
import events
lesson completion failures
review completion failures
rate-limit events
```

Only expose events that are already safely available through the application logging/monitoring boundary.

---

# 51. System Log Privacy

Never display intentionally sensitive content in the Admin log UI.

Do not expose:

```text
auth tokens
passwords
session identifiers
raw journal text
microphone recordings
private notes
full typed answers
database credentials
provider secrets
```

Structured logs must follow the existing privacy rules.

---

# 52. Sentry

Sentry remains the primary external application/error monitoring platform.

The Admin System tab may link or summarize relevant diagnostics where practical.

Do not build an in-house replacement for:

```text
stack trace exploration
performance profiling
release analysis
issue grouping
```

unless a future spec explicitly requires it.

---

# 53. Developer Sandbox

Route:

```text
/admin/sandbox
```

Available to:

```text
admin
developer
```

A developer without admin role can use the sandbox but cannot mutate official curriculum.

---

# 54. Sandbox Isolation

The sandbox already uses a separate Polyglot user row:

```text
users.is_sandbox
users.sandbox_owner_user_id
clerk_user_id = null
```

owned by the real admin/developer account.

All sandbox learning state must remain isolated from real learner state.

Do not introduce:

```text
is_sandbox
```

flags across every progress table.

Continue using the existing isolated-user design.

---

# 55. Sandbox Capabilities

The sandbox UI should provide access to existing planned sandbox capabilities:

```text
simulate any curriculum level
set arbitrary sandbox SRS stages
make sandbox reviews immediately due
unlock practices
unlock tests
view unlock behavior
view onboarding
preview animations
simulate future time
reset sandbox state
```

These capabilities are already part of the intended architecture.

---

# 56. Sandbox Learner View

Provide a way for the admin/developer to launch or inspect the application as the sandbox user.

Conceptually:

```text
Sandbox Controls

Level:              [ 12 ▼ ]
SRS stage:           [ Familiar 1 ▼ ]
Reviews:             [ Make due ]
Practices:           [ Unlock ]
Tests:               [ Unlock ]
Simulated time:      [ +7 days ]
                    [ Open Sandbox Experience ]
```

The exact UI may be refined during implementation.

---

# 57. Sandbox Time

Time simulation must use the sandbox-specific clock abstraction.

It must not:

```text
modify server time
modify global app time
modify another sandbox
modify real user review times
```

A sandbox owner can simulate future state only within the sandbox boundary.

---

# 58. Sandbox Reset

Provide:

```text
Reset Sandbox
```

This clears/reinitializes only the current admin/developer's sandbox learner state.

It must not affect:

```text
real account state
official curriculum
other sandboxes
production user progress
```

Use explicit confirmation.

---

# 59. Sandbox and Production Curriculum

The sandbox should read the same official curriculum available in that environment.

Do not duplicate curriculum records specifically for sandbox use.

The sandbox isolates learner state, not official curriculum.

---

# 60. Environment Safety

Development, preview, and production remain isolated.

Production credentials or production learner data must never be copied into development or preview environments.

The Admin UI should visibly indicate the current environment in non-production environments.

Example:

```text
PREVIEW
```

or:

```text
DEVELOPMENT
```

This helps prevent accidental assumptions about which environment an admin is changing.

---

# 61. Cache Invalidation

All official curriculum mutations must invalidate affected curriculum cache tags.

Examples:

```text
item update
publish
archive
delete
move
reorder
group update
level update
CSV commit
```

A cache with no defined invalidation point is not acceptable.

Published learner-facing pages should reflect newly published curriculum without waiting for an arbitrary stale cache timeout.

---

# 62. Concurrency Protection

Admin edits should avoid silently overwriting another administrator's changes.

When editing mutable curriculum:

```text
load version / updated_at
→ admin edits
→ submit expected version
→ compare current version
```

If another actor changed the record first:

```text
ADMIN_EDIT_CONFLICT
```

Return a clear conflict state.

Example:

```text
This item changed after you opened it.

Reload the latest version before publishing your changes.
```

Do not silently use last-write-wins for important curriculum content.

---

# 63. Structured Errors

Expected Admin errors should use explicit codes.

Examples:

```text
UNAUTHENTICATED
FORBIDDEN
ADMIN_EDIT_CONFLICT
CURRICULUM_ITEM_NOT_FOUND
CURRICULUM_VALIDATION_FAILED
DUPLICATE_ITEM
DUPLICATE_REVIEW_REQUIRED
ITEM_REFERENCED
IMPORT_INVALID_FILE
IMPORT_INVALID_ROW
IMPORT_COMMIT_FAILED
IMPORT_TOO_LARGE
SANDBOX_NOT_FOUND
SANDBOX_OPERATION_FORBIDDEN
RATE_LIMITED
```

Never expose raw stack traces or SQL messages to the Admin browser.

---

# 64. Rate Limiting

Administrative mutation endpoints should use appropriate rate limits where abuse or accidental repeated submission could be harmful.

Possible policies:

```text
admin-mutation
admin-import
admin-publish
sandbox-mutation
```

Thresholds belong in configuration.

Do not scatter literal limits through handlers.

---

# 65. Idempotency

High-impact operations should use idempotency where repeated submissions could otherwise cause duplicate effects.

Examples:

```text
CSV commit
Publish
Archive
Delete
Bulk reorder
```

A repeated request with the same idempotency key and payload should not create duplicate audit events or duplicate curriculum records.

---

# 66. Validation

Use runtime schemas for all administrative boundaries.

Validate:

```text
forms
route parameters
server actions
API bodies
CSV rows
bulk operations
publish actions
sandbox mutations
```

TypeScript types are not sufficient for untrusted administrative input.

---

# 67. Database Changes

This spec will likely require additive schema changes.

Expected additions may include:

```text
admin_audit_events
curriculum revision/draft support
import batches
import rows / import results
pending publication state
```

Exact tables should follow existing domain boundaries and normalization conventions.

Do not modify migrations that have already been merged/applied.

Generate additive migrations only.

---

# 68. Curriculum Revision Strategy

Because published edits should not immediately become live, the implementation needs a durable way to distinguish:

```text
currently published data
unpublished administrative changes
```

Recommended model:

```text
stable learning item identity
+
editable revision/draft data
+
explicit publish operation
```

Do not accomplish this by mutating the production row and hoping the UI remembers that it is "draft."

The server must be able to reliably answer:

```text
What do learners currently see?
What is the admin currently editing?
```

independently.

The exact schema may be chosen during implementation as long as stable item identity and existing user progress remain preserved.

---

# 69. Pending Imported Content

Imported content should use the same draft/publication architecture.

Flow:

```text
CSV accepted row
→ create/update pending revision
→ admin reviews
→ explicit Publish
→ live curriculum changes
```

Do not create a second completely separate curriculum model exclusively for imports.

---

# 70. Published Referential Integrity

A published revision must not reference:

```text
missing Level
missing language
missing required group
invalid sentence
invalid grammar configuration
archived dependency where prohibited
```

Publication should fail validation rather than allowing inconsistent live curriculum.

---

# 71. Bulk Actions

The curriculum table may support multi-select actions.

Recommended v1 actions:

```text
Archive selected
Move to level
Move to group
Change status where safe
Publish selected pending items
```

Do not implement broad destructive bulk deletion without careful safety checks.

Every bulk operation must preserve per-item validation.

---

# 72. Bulk Publish

Pending items may be published in a batch.

Before committing:

```text
validate every selected item
validate relationships
validate duplicate resolutions
validate affected Level configuration
```

If the batch is configured as one transactional publication operation:

```text
all selected items publish
```

or:

```text
none publish
```

Do not leave an ambiguous partially published batch after an unexpected database failure.

---

# 73. Accessibility

Admin UI must support:

* keyboard navigation
* visible focus states
* table controls with labels
* sortable headers with accessible state
* dialogs with proper focus trapping
* destructive confirmations
* non-color status indicators
* drag/drop alternatives for ordering
* accessible file upload
* accessible validation summaries
* readable error states

Do not make a dense administrative UI keyboard-hostile.

---

# 74. Responsive Behavior

Desktop is the primary Admin target.

Desktop should prioritize:

```text
table density
multiple filters
side navigation
editing efficiency
```

Tablet/mobile should remain functional.

On smaller screens:

* table may switch to stacked rows/cards
* filters may move into a sheet/dialog
* side navigation may collapse
* editor forms should become single-column

Do not require horizontal scrolling for basic administrative actions when avoidable.

---

# 75. Suggested Code Organization

Recommended:

```text
app/(admin)/admin/
  layout.tsx
  page.tsx

  curriculum/
    items/
      page.tsx
      new/
        page.tsx
      [itemId]/
        page.tsx

    levels/
      page.tsx
      [levelId]/
        page.tsx

    groups/
      page.tsx
      [groupId]/
        page.tsx

  logs/
    page.tsx

  sandbox/
    page.tsx

components/admin/
  admin-sidebar.tsx
  admin-page-header.tsx

  curriculum/
    curriculum-table.tsx
    curriculum-filters.tsx
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
  authorization.ts
  audit-service.ts
  import-service.ts
  duplicate-review.ts
  publication-service.ts
  server.ts
```

Use existing:

```text
domains/curriculum
domains/users
domains/srs
domains/progress
```

for authoritative domain rules they already own.

The `admin` domain orchestrates workflows rather than duplicating curriculum or SRS logic.

---

# 76. Domain Ownership

`admin` owns:

```text
administrative workflow orchestration
publication workflow
audit events
duplicate resolution workflow
sandbox administration
```

`curriculum` continues to own:

```text
curriculum structure
curriculum validation
stable learning-item identity
item relationships
ordering rules
```

`srs` continues to own SRS rules.

`progress` continues to own learner progress.

Admin may call those domains but must not reimplement their business logic.

---

# 77. Implementation Units

Implement incrementally.

## Unit 1 — Admin authorization and shell

Build:

```text
/admin
admin route guard
admin/developer permission helpers
Admin layout
sidebar/navigation
environment badge
```

Verify:

* normal user denied
* admin admitted
* developer admitted only to permitted surfaces
* developer cannot edit official curriculum
* direct route access is protected

---

## Unit 2 — Audit foundation

Add durable administrative audit storage.

Implement:

```text
audit schema
audit repository
audit service
structured action types
actor/resource metadata
cursor pagination
```

No curriculum editing should ship before mutation auditing is available.

---

## Unit 3 — Curriculum admin read model

Build:

```text
curriculum admin listing
search
filters
sorting
pagination
indexes
```

Use real curriculum data.

Verify:

```text
language
level
type
status
group
search
```

---

## Unit 4 — Draft/publication model

Implement durable separation between:

```text
published curriculum
draft/pending administrative changes
```

Build:

```text
Save Draft
Pending
Publish
version/conflict detection
cache invalidation
audit logging
```

---

## Unit 5 — Vocabulary and Grammar editors

Implement full forms for supported curriculum data.

Include:

```text
accepted answers
grammar configuration
sentences/examples
Level
group/theme
ordering
status
```

Verify published edits remain unpublished until explicit Publish.

---

## Unit 6 — Levels, groups, and ordering

Implement:

```text
Levels admin
group/theme admin
curriculum validation counts
item moves
group moves
reordering
```

Preserve stable item IDs.

---

## Unit 7 — Archive/delete safety

Implement:

```text
dependency check
archive referenced records
permanent delete only safe records
confirmation
audit log
cache invalidation
```

Verify learner progress is never silently destroyed.

---

## Unit 8 — Duplicate detection

Implement duplicate detection for:

```text
manual create
manual edit
imports
```

Include:

```text
language scoping
normalization
accent preservation
matching item display
homonym approval
audit event
```

---

## Unit 9 — CSV parsing and preview (REMOVED — CSV import descoped 2026-09-05)

## Unit 10 — CSV staging and commit (REMOVED — CSV import descoped 2026-09-05)

---

## Unit 11 — Logs UI

Implement:

```text
Audit tab
System tab
filtering
pagination
privacy filtering
external monitoring link where appropriate
```

Do not reproduce full Sentry functionality.

---

## Unit 12 — Sandbox UI

Implement the existing isolated sandbox controls.

Include:

```text
level simulation
SRS stage
review due state
practice/test unlocks
time simulation
reset
launch sandbox learner experience
```

Verify sandbox mutations can never reach a real learner.

---

## Unit 13 — E2E/security verification

Perform complete role, mutation, CSV, sandbox, and safety verification.

Update:

```text
progress-tracker.md
architecture.md
```

with any finalized implementation decisions.

---

# 78. Unit Tests

Cover at minimum:

```text
admin authorization
developer authorization
developer curriculum mutation rejection

draft creation
pending creation
publication
archive decision
safe permanent deletion
published revision preservation

duplicate normalization
accent-sensitive duplicate behavior
homonym approval

level validation
group ordering
item ordering

CSV parsing
CSV required fields
CSV invalid rows
CSV duplicate rows
CSV existing-item match
CSV staged pending state
CSV transaction rollback

audit creation
audit filtering

sandbox ownership
sandbox role access
sandbox isolation
sandbox time calculation
```

---

# 79. Integration Tests

Use the real integration database strategy.

Cover:

```text
admin role resolved from DB
unauthorized mutation rejected
curriculum item creation transaction
publication transaction
audit event written with mutation
cache invalidation boundary invoked
published revision unchanged while draft edited
archive preserves referenced progress
delete succeeds only when unreferenced
move preserves stable item ID
CSV accepted batch transaction rolls back on failure
duplicate resolution persists
sandbox user belongs to owner
sandbox progress cannot reference real-user ownership incorrectly
```

---

# 80. Component Tests

Cover:

```text
Admin sidebar
Curriculum filters
Search
Status filters
Pagination controls
Vocabulary editor
Grammar editor
Sentence editor
Draft/Publish controls
Delete/Archive confirmation
Duplicate warning
Homonym approval
CSV upload
CSV preview
CSV row status
Import summary
Audit/System tabs
Sandbox controls
```

---

# 81. Browser Verification

## Permissions

Verify:

```text
normal user → /admin → forbidden/not allowed
admin → full Admin UI
developer → sandbox/log access
developer → official curriculum edit blocked
```

Test direct URLs, not only hidden navigation.

---

## Curriculum

Verify:

* searching works
* filters combine correctly
* pagination works
* vocabulary can be created
* grammar can be created
* sentences can be edited
* accepted answers can be edited
* grammar configuration can be edited
* items can be moved
* items can be reordered
* groups can be created/reordered
* Level configuration can be edited

---

## Publication

Verify:

```text
published item
→ edit
→ Save Draft
→ learner still sees old published version
→ Publish
→ learner sees new version
```

This is a critical E2E case.

---

## Delete/Archive

Verify:

```text
referenced item
→ Delete
→ Archive
→ progress remains

unreferenced draft
→ Delete
→ permanent removal permitted
```

---

## Duplicate

Verify:

```text
gato vs GATO → duplicate
si vs sí → not automatically duplicate
approved homonym → separate item created
```

---

## Logs

Verify:

* mutation appears in Audit log
* appropriate before/after metadata shown
* sensitive fields absent
* filters work
* cursor pagination works

---

## Sandbox

Verify:

```text
change sandbox level
change sandbox SRS
make review due
simulate time
reset sandbox
```

then verify the real admin learner account is unchanged.

---

# 82. Security Verification

Attempt:

```text
normal user calling admin mutation endpoint directly
developer calling curriculum mutation directly
changing hidden form IDs
editing another import
replaying publish request
replaying CSV commit
invalid stable item IDs
forged role/client state
oversized CSV
malformed CSV
dangerous filenames
unexpected CSV columns
duplicate submission
```

All must fail safely.

---

# 83. Performance Requirements

Admin is not as latency-sensitive as reviews, but it must still follow the existing application rules.

Required:

* paginated queries
* no N+1
* explicit selected DB columns
* indexed search/filter paths
* server components where practical
* no loading entire curriculum client-side
* no blocking learner requests on Admin analytics/logging
* no loading full audit history at once

---

# 84. Logging

Critical Admin events should also generate structured operational logs where useful.

Examples:

```text
curriculum publication
curriculum movement
import commit
archive/delete
duplicate approval
sandbox reset
```

Do not put full curriculum payloads into generic log messages unnecessarily.

The durable Admin Audit Log is the source for detailed administrative change history.

---

# 85. Out of Scope

Do not implement in this spec:

* inspecting arbitrary real-user learning progress
* manually editing real-user SRS stages
* manually unlocking real-user Levels
* customer support impersonation
* Clerk account management UI
* billing administration
* PostHog analytics dashboard
* full Sentry replacement
* background queue infrastructure unless actual CSV size requires it
* AI-generated curriculum publishing
* automatic AI curriculum mutation
* production database console
* raw SQL execution from Admin
* direct database browser
* unrestricted environment switching

Support tooling for real users may be a later Admin Support spec.

---

# 86. Completion Criteria

Spec 11 is complete when:

1. `/admin` has a dedicated protected Admin shell.
2. Database roles are authoritative for Admin access.
3. `admin` can manage curriculum, logs, and sandbox.
4. `developer` can access sandbox/approved diagnostics but cannot mutate official curriculum without `admin`.
5. Curriculum is available through a searchable, filterable, paginated Admin table.
6. Admins can create and edit Vocabulary items.
7. Admins can create and edit Grammar items.
8. Admins can manage accepted official answers.
9. Admins can manage all supported grammar configuration.
10. Admins can manage sentences/examples.
11. Admins can manage Levels.
12. Admins can manage vocabulary groups/themes.
13. Admins can reorder curriculum.
14. Stable learning-item IDs survive edits and moves.
15. Published edits use Save Draft → Publish rather than immediate live mutation.
16-20. ~~Removed — CSV import descoped 2026-09-05.~~ Numbering kept stable rather than renumbering the rest of this list.
21. Exact duplicates require deliberate resolution.
22. Legitimate homonyms can be explicitly approved.
23. Meaningful accents/diacritics remain significant.
24. Referenced curriculum is archived rather than physically deleted.
25. Permanent deletion is permitted only when referential integrity proves it safe.
26. Every administrative mutation creates an audit trail.
27. Audit logs are filterable and cursor-paginated.
28. System logs expose useful diagnostics without exposing sensitive content.
29. Admin does not attempt to replace Sentry.
30. Sandbox state uses the existing isolated sandbox-user model.
31. Sandbox operations cannot mutate real learner state.
32. Sandbox time simulation is sandbox-specific.
33. Admin curriculum mutations invalidate affected curriculum caches.
34. Concurrent admin edits cannot silently overwrite each other.
35. Direct unauthorized calls to Admin mutations fail server-side.
36. Unit, integration, component, and browser tests pass.
37. Typecheck, lint, build, and migration validation pass.
38. `progress-tracker.md` is updated after implementation.
39. Any finalized new architecture/schema decisions are recorded in `architecture.md`.