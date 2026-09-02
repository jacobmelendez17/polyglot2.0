# Spec 08 — Database Foundation

Read `AGENTS.md`, `context/project-overview.md`,
`context/architecture.md`, `context/code-standards.md`,
`context/ui-context.md`, `context/ai-workflow-rules.md`,
and `context/progress-tracker.md` before starting.

Implement Polyglot's first real persistent data foundation.

This feature establishes:

- Neon PostgreSQL connectivity
- Drizzle ORM
- typed database configuration
- the initial relational schema
- generated migrations
- migration verification
- database-backed internal users
- server-authoritative role resolution
- the language/curriculum persistence foundation
- the progress persistence foundation
- the SRS domain foundation
- learner-owned notes and synonyms
- the developer sandbox schema affordance
- the idempotency foundation
- the rate-limit provider
- deterministic database fixtures
- a real PostgreSQL integration-test harness
- ephemeral Neon databases for CI integration/migration testing

Do not implement lesson sessions, review sessions, dashboard aggregation,
admin curriculum tooling, or normal progress-affecting user workflows in
this spec.

The source-of-truth architecture and code standards already define the
business rules and operational constraints.

Do not duplicate those rules in page/components or create alternate
implementations.

---

## Revision Notes

Section numbering 1–71 is unchanged from the previous draft. New material is
appended as §72–§75 and cross-referenced from the relevant earlier sections.

Two sections were **inverted**:

- **§53** previously said not to implement idempotency. It now specifies the
  idempotency foundation.
- **§54** previously deferred the rate-limit provider. It now specifies its
  implementation.

This was done so that Spec 07 unit 6 is unblocked by Spec 08 rather than
depending on a third unwritten spec. After this spec ships, update Spec 07's
Prerequisites table: every listed blocker is resolved.

The cost is size. This spec is now eight implementation units (§67). Do not
attempt it in one pass.

## Decisions Resolved In This Revision

1. **Progress rows are created only at enrollment.** `srs_stage` is `NOT NULL`.
   Unlock state lives entirely in `user_level_progress`. See §24, §25.
2. **Idempotency and rate limiting are in scope.** See §53, §54.
3. **Provisioning seeds a starting state.** New users get the configured
   default language and a Level 1 unlock. See §11.
4. **Learner-owned notes and synonyms have tables.** See §72.
5. **The developer sandbox is isolated at the user boundary.** See §73.
6. **The Neon adapter is `drizzle-orm/neon-serverless`.** See §3.
7. **`language_id` is denormalized onto `user_item_progress`** so the
   due-review query can be indexed. See §24, §41.
8. **Referential actions are specified per foreign key.** See §21.
9. **`updated_at` is maintained at the application layer.** See §21.
10. **Timezone defaults to `UTC` at provisioning.** See §11.

---

# 1. Locked Technical Decisions

This spec resolves the remaining database-foundation questions.

## Rate-Limit Store

Use:

`Upstash Redis`

as the v1 rate-limit backing store.

It remains behind the existing:

`providers/rate-limit`

boundary.

The provider is implemented in this spec — see §54.

This decision matters here because:

- rate-limit state must not require Neon tables
- the application database remains focused on durable relational product data
- future progress mutations will consume the provider without changing domain
  architecture

Do not add:

- rate-limit counters
- token buckets
- request windows
- IP limiter tables

to PostgreSQL.

Update the relevant context documentation so the previously unresolved backing
store question is marked resolved.

---

## Integration Test Database

Integration tests use:

`TEST_DATABASE_URL`

as their database boundary.

Tests must not know whether that URL points to Neon or another real PostgreSQL
instance.

### CI

CI provisions an ephemeral Neon database branch for database integration tests
and migration verification.

Conceptually:

    Create ephemeral Neon branch
        ↓
    Resolve TEST_DATABASE_URL
        ↓
    Apply migrations
        ↓
    Seed deterministic fixtures
        ↓
    Run integration tests
        ↓
    Delete ephemeral branch

Cleanup must run even when tests fail where the CI platform permits it.

Automatic Neon branch expiration should also be configured as a secondary
cleanup mechanism where supported.

### Local Development

`TEST_DATABASE_URL` may point to:

- a dedicated Neon development/test branch
- a local real PostgreSQL database

Do not use:

- SQLite
- an in-memory PostgreSQL imitation
- mocked SQL
- a fake repository implementation

for integration tests.

Unit tests remain database-free where appropriate.

---

# 2. Database Connection Preflight

Before implementing schema work, inspect the repository and environment.

Check for an existing usable development PostgreSQL connection.

Possible sources are:

1. an existing Neon development connection string
2. an explicitly configured local PostgreSQL database
3. a new Neon development project/branch configured with the user

Do not invent connection strings.

Do not commit credentials.

Do not print secrets into logs or documentation.

If no usable development database connection exists, stop only at the point
where database access becomes necessary and clearly report that database
configuration is required.

Do not build a fake database layer merely to continue.

---

# 3. Dependencies

Install the database dependencies needed for the chosen architecture.

Use:

- `drizzle-orm`
- `drizzle-kit`
- `@neondatabase/serverless`

## Adapter

Use the `@neondatabase/serverless` `Pool` with `drizzle-orm/neon-serverless`.

Do **not** use `drizzle-orm/neon-http`. It is the adapter most examples show,
and it cannot perform interactive transactions. `architecture.md` requires
transactional behavior for:

- atomic review-item completion
- atomic lesson-batch enrollment
- concurrency protection
- transactional progress updates
- transactional idempotency recording

A `ws` polyfill may be required depending on the execution runtime. Adding it
is acceptable under `code-standards.md`.

§60's transaction test exists to catch a wrong adapter choice, but the choice
should not need catching.

If an additional small database driver dependency is genuinely required by
migration tooling or local PostgreSQL integration testing, it may be added
according to `code-standards.md`.

Do not introduce a large database framework in addition to Drizzle.

Rate-limit dependencies are covered separately in §54.

---

# 4. Database Directory

Create the database foundation under:

    db/
      client.ts
      schema/
        index.ts
        users.ts
        languages.ts
        curriculum.ts
        progress.ts
        learner-content.ts
        idempotency.ts
      migrations/
      seed/
        test-fixtures.ts

Exact schema-file splitting may differ slightly if a cleaner dependency
structure emerges.

Keep schema definitions grouped by domain rather than creating one enormous
schema file.

Create:

`drizzle.config.ts`

at the project root unless the existing repository structure provides an
equivalent established location.

---

# 5. Environment Configuration

Extend the existing typed environment configuration.

Server runtime requires:

`DATABASE_URL`

Integration tests use:

`TEST_DATABASE_URL`

The rate-limit provider requires:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Continue using:

`APP_ENV`

according to the existing environment architecture.

Do not expose database URLs through `NEXT_PUBLIC_*`.

Do not expose:

- Neon API keys
- connection strings
- database credentials
- Upstash credentials

to client bundles.

Document required variables in:

`.env.example`

without real credentials.

CI-only Neon provisioning values such as:

- Neon project ID
- Neon API credentials

belong in CI secret configuration, not public application environment
variables.

Do not force `TEST_DATABASE_URL` to exist during normal application runtime.

Only integration-test tooling should require it.

Upstash credentials must not be required for unit tests or database
integration tests. See §54's in-memory implementation.

---

# 6. Database Client Boundary

Create one authoritative database-client module.

Use:

`db/client.ts`

Application code must import database access through the repository/domain
layer rather than creating ad hoc connections.

Do not initialize separate database clients in:

- React components
- pages
- route handlers
- Server Actions
- random utilities

The runtime client must follow the serverless Neon architecture already
defined in `architecture.md`.

Do not run migrations from `db/client.ts`.

Do not run migrations:

- during application startup
- during a request
- during Next.js rendering

Migration execution remains an explicit operational step.

---

# 7. PostgreSQL ID Strategy

Use stable application-controlled internal identifiers.

Prefer UUID primary keys for durable domain entities.

Examples:

- users
- languages
- levels
- groups
- learning items
- sentences

Do not use:

- Clerk IDs
- vocabulary text
- grammar titles
- database insertion order

as durable Polyglot identity.

Stable learning-item identity must survive later:

- reordering
- moving between levels
- moving between groups
- display-content edits

---

# 8. Initial Enums / Domain Values

Create explicit database/domain values where appropriate.

At minimum support:

## User Roles

- `user`
- `admin`
- `beta-tester`
- `developer`

## Curriculum Item Status

- `draft`
- `published`
- `archived`

## Learning Item Type

v1 requires:

- `vocabulary`
- `grammar`

The shared learning-item design must remain compatible with future types such
as:

- kanji
- radicals

Do not build Japanese-specific type tables in this spec unless required by
the existing architecture implementation.

## SRS Stages

Support explicit stage identifiers:

- `beginner_1`
- `beginner_2`
- `beginner_3`
- `beginner_4`
- `familiar_1`
- `familiar_2`
- `intermediate`
- `master`
- `fluent`

Do not depend on PostgreSQL enum ordering or array index ordering for SRS
business logic.

Stage progression belongs to the SRS domain.

## Synonym Side

For §72:

- `term` — an accepted target-language form
- `meaning` — an accepted English meaning

## Idempotency Status

For §53:

- `in_progress`
- `succeeded`

---

# 9. Users Table

Create the internal Polyglot user record required by the authentication
architecture.

At minimum the user record must support:

    id
    clerk_user_id
    role
    display_name
    timezone
    active_language_id
    is_sandbox
    sandbox_owner_user_id
    created_at
    updated_at

Use appropriate nullability based on whether the value exists at initial
provisioning.

Requirements:

- `clerk_user_id` is **nullable**, with a partial unique index over non-null
  values only
- role defaults to `user`
- timezone stores an IANA-compatible identifier
- active language references `languages`
- timestamps use PostgreSQL timezone-aware timestamps / UTC behavior

`clerk_user_id` is nullable because sandbox personas (§73) are real user rows
with no Clerk identity. A plain unique constraint would allow only one such
row. Use:

    CREATE UNIQUE INDEX ... ON users (clerk_user_id) WHERE clerk_user_id IS NOT NULL

Do not store:

- passwords
- password hashes
- Clerk session tokens
- OAuth credentials
- MFA secrets

Clerk owns authentication credentials.

Neon owns Polyglot application data.

Do not add unresolved XP/rank systems merely because they are future user
properties.

Only add fields needed by the current foundation.

See §73 for `is_sandbox` and `sandbox_owner_user_id`.

---

# 10. Internal User Provisioning

Implement a server-side resolver that maps the authenticated Clerk identity
to the internal Polyglot user.

Conceptually:

    Clerk session
        ↓
    Clerk user ID
        ↓
    Polyglot users.clerk_user_id
        ↓
    internal Polyglot user

Create a reusable server-only helper such as:

`resolveCurrentUser()`

or an equivalent domain-appropriate name.

Behavior:

1. Require an authenticated Clerk identity.
2. Look up the internal user by `clerk_user_id`.
3. If the internal user exists, return it.
4. If it does not exist, safely provision it with its starting state per §11.
5. Return the authoritative internal user record.

Provisioning must be race-safe.

Two concurrent requests from a brand-new account must not create two internal
users, and must not create two Level 1 unlock rows.

Use the database unique constraint as the final concurrency guarantee.

Do not implement:

    SELECT
    if missing:
        INSERT

without handling the uniqueness race.

Use an upsert or insert/conflict strategy appropriate to PostgreSQL.

The whole of §11's starting state is created in **one transaction** with the
user row. A user must never exist in a half-provisioned state.

---

# 11. Initial User Data

When creating the Polyglot user:

- default role is `user`
- copy only safe initial profile information that is useful for Polyglot
- default timezone is `UTC`
- set `active_language_id` to the configured default language
- create the Level 1 unlock row for that language

## Timezone

Clerk does not supply a timezone. Provision with `UTC` and let a later
settings or onboarding flow correct it from the browser.

Do not leave timezone null. Daily-boundary logic must never encounter an
absent timezone.

## Default Language

v1 ships one language. Resolve the default by stable code/slug from
configuration, never by hardcoded UUID and never by "first row."

## Starting Unlock

Create a `user_level_progress` row for Level 1 of the default language with
`unlocked_at` set to the provisioning time.

Without this, a new user has no unlocked level, therefore no eligible learning
items, therefore no lessons. Spec 07 §65's empty state would fire permanently.

## Missing Prerequisites

If the configured default language or its Level 1 does not exist, provisioning
fails with a structured error rather than creating a user with no starting
state.

Fixtures and seeds must guarantee both exist. See §37.

## Roles

Do not treat Clerk metadata as authoritative role input.

For example, this must never happen:

    role = clerk.publicMetadata.role

without database authorization.

The database owns the role.

---

# 12. Server-Authoritative Roles

Implement reusable server-side role resolution.

The role stored in Polyglot's database is authoritative.

Clerk metadata may eventually mirror a role for UI convenience, but this
spec must not trust it for sensitive authorization.

Create reusable helpers for behavior such as:

    requireUser()
    requireRole(...)
    hasRole(...)

Exact names may differ.

Keep them centralized.

Do not duplicate:

    if (role === "admin")

throughout pages and handlers.

No role-management UI is required in this spec.

Role assignment beyond normal `user` provisioning may be performed only by:

- controlled development/test fixtures
- future authorized administrative workflows

Do not expose a client endpoint that lets a user assign themselves:

- admin
- developer
- beta-tester

---

# 13. Languages Table

Create the language persistence foundation.

At minimum support:

    id
    code
    slug
    name
    created_at
    updated_at

Seed the initial Spanish language configuration.

Use a language code appropriate for the configured Latin American Spanish /
Mexican curriculum.

Do not write application logic that assumes a hardcoded numeric Spanish ID.

Application logic must resolve language records by stable identifiers.

Language records are authoritative for curriculum scoping.

---

# 14. Levels Table

Create curriculum levels.

At minimum support:

    id
    language_id
    level_number
    name / label when useful
    status
    created_at
    updated_at

Requirements:

- level numbers are scoped to language
- `(language_id, level_number)` must be unique
- `(id, language_id)` must also be unique, to support the composite foreign
  keys in §22
- curriculum ordering must never depend on insertion order

Do not hardcode assumptions such as:

`Spanish always has exactly N levels`

into the schema.

---

# 15. Vocabulary Groups

Create vocabulary-group/theme persistence.

At minimum support:

    id
    level_id
    name
    position
    status
    created_at
    updated_at

Requirements:

- group position is explicit
- position is scoped to the containing level
- insertion order is not curriculum order

The current validation target of:

- 4 vocabulary groups
- 12 vocabulary items per group

is a curriculum validation rule, not a schema limitation.

Do not create a schema that can never support another group count.

---

# 16. Shared Learning Item Identity

Implement the shared learning identity already defined by the architecture.

Create:

`learning_items`

At minimum support:

    id
    language_id
    level_id
    type
    status
    position
    lesson_priority
    created_at
    updated_at

This row is the permanent identity of the learning item.

Do not create separate unrelated IDs as the authoritative identity for:

- vocabulary SRS
- grammar SRS
- progress
- lessons
- learner notes and synonyms

Those systems reference the shared learning-item ID.

Editing curriculum content must not generate a replacement learning-item ID.

Moving an item to another level or group must not generate a replacement ID.

`(id, language_id)` must be unique, supporting §22's composite foreign keys.

---

# 17. Learning Item Ordering

Ordering must be explicit.

Use data such as:

- level
- item type
- item position
- vocabulary-group position
- lesson priority

Do not infer curriculum order from:

- UUID
- created timestamp
- insertion order

Use uniqueness constraints where they cleanly enforce expected ordering.

For example, duplicate item positions of the same learning-item type inside
the same level should not silently occur.

---

# 18. Vocabulary Items

Create the vocabulary-specific table keyed by:

`learning_item_id`

The learning-item ID should be the primary/reference identity.

At minimum support curriculum fields required by the current vocabulary model
such as:

    learning_item_id
    vocabulary_group_id
    term
    primary_meaning
    definition
    article
    part_of_speech
    pronunciation
    ipa
    context
    creator_notes

Use appropriate nullable fields where the content is optional.

Do not store learner-specific state here.

Do not store:

- SRS stage
- next review
- learner accuracy
- learner notes
- learner synonyms

inside official vocabulary records. Learner-owned content lives in §72's
tables.

---

# 19. Grammar Items

Create the grammar-specific table keyed by:

`learning_item_id`

At minimum support curriculum fields required by the current grammar model
such as:

    learning_item_id
    title / pattern
    primary_meaning
    structure
    explanation
    category
    creator_notes

Use terminology that fits the existing grammar data model.

Do not create a separate SRS identity for grammar.

The corresponding `learning_items.id` remains the durable identity.

Do not add Spanish-only columns to shared learning-item tables.

Language-specific content belongs in the appropriate curriculum layer.

---

# 20. Supporting Sentences

Establish the relational foundation for reusable official example sentences.

Create a structure conceptually equivalent to:

    sentences
    learning_item_sentences

A sentence should support at minimum:

    id
    language_id
    target_text
    translation
    status
    created_at
    updated_at

The relationship table should support explicit display ordering, and
`(learning_item_id, position)` should be unique.

Do not give example sentences their own SRS stage.

They are supporting curriculum content.

Do not implement the admin sentence editor in this spec.

---

# 21. Curriculum Integrity

Add database constraints where practical.

At minimum protect:

- valid foreign keys
- unique language identifiers
- unique level numbers within a language
- stable one-to-one vocabulary/grammar type tables
- duplicate vocabulary-group position within a level
- duplicate curriculum ordering where inappropriate

Use application/domain validation in addition to database constraints.

Do not try to encode every product curriculum rule as a rigid SQL constraint.

Rules such as:

- exactly 48 vocabulary per level
- exactly 12 grammar items
- exactly 4 vocabulary groups

remain validation/configuration rules.

## Referential Actions

Specify `ON DELETE` explicitly on every foreign key. Drizzle's default is no
action, which is correct in some places and wrong in others.

**Cascade from `users`:**

- `user_item_progress.user_id`
- `user_level_progress.user_id`
- `user_notes.user_id`
- `user_synonyms.user_id`
- `idempotency_keys.user_id`
- `users.sandbox_owner_user_id`

This supports the delete-account flow in `architecture.md`.

**Restrict from curriculum:**

- `user_item_progress.learning_item_id`
- `user_notes.learning_item_id`
- `user_synonyms.learning_item_id`
- `user_level_progress.level_id`
- `learning_item_sentences.*`

`architecture.md` requires that published items referenced by user progress be
archived rather than physically deleted. `RESTRICT` enforces that at the
database level instead of relying on discipline.

## Timestamp Maintenance

`updated_at` is maintained at the application layer using Drizzle's
`$onUpdate`, not a PostgreSQL trigger.

Every table declaring `updated_at` must actually set it on write. A column
that silently freezes at insert time is worse than no column.

---

# 22. Multi-Language Safety

Curriculum and learner state must remain language-scoped.

Where practical, use relational constraints that make cross-language
relationships impossible.

Example:

A learning item assigned to Spanish must not reference a level belonging to a
different language.

## Composite Foreign Keys

Enforce this with composite foreign keys rather than deferring to the
application layer.

Given the unique `(id, language_id)` constraints added in §14 and §16:

    learning_items (level_id, language_id)
      → levels (id, language_id)

    user_item_progress (learning_item_id, language_id)
      → learning_items (id, language_id)

This makes a cross-language row unrepresentable rather than merely discouraged.

Apply the same pattern to vocabulary groups and sentences where the
relationship crosses a language boundary.

If a clean PostgreSQL constraint is genuinely impractical for a relationship,
enforce the invariant in the domain/repository layer and cover it with
integration tests.

Never trust a client-provided language ID to authorize access.

---

# 23. Progress Schema

Create the persistent progress foundation.

At minimum implement:

`user_item_progress`

and:

`user_level_progress`

Do not implement practice-specific progress tables in this spec.

---

# 24. User Item Progress

`user_item_progress` represents learner-specific state for a shared official
learning item.

**A row exists only once the item has been learned.** See §25.

At minimum support:

    user_id
    learning_item_id
    language_id
    srs_stage
    learned_at
    next_review_at
    fluent_at
    correct_count
    incorrect_count
    review_count
    last_reviewed_at
    version
    created_at
    updated_at

`unlocked_at` is deliberately absent. Unlock is level-scoped and lives in
`user_level_progress`. A per-item unlock timestamp on a table whose rows only
exist after enrollment would always equal `learned_at`.

Use a unique/composite identity so a user cannot have duplicate progress rows
for the same learning item.

The exact representation may use:

    PRIMARY KEY (user_id, learning_item_id)

or an internal row ID plus an equivalent unique constraint.

The business identity is:

`user + learning item`

## Denormalized Language

`language_id` is stored on this table even though it is derivable through
`learning_items`.

This is a deliberate denormalization. The due-review query filters by user,
language, and next review time, and a composite index cannot span a join. See
§41.

It is kept honest by the composite foreign key in §22, which makes a
progress row whose `language_id` disagrees with its learning item impossible.

---

# 25. Progress Row Semantics

**A `user_item_progress` row is created only at SRS enrollment.**

`srs_stage` is `NOT NULL`. There is no "row exists but not learned" state.

This yields three unambiguous rules the rest of the system depends on:

| Question | Answer |
| --- | --- |
| Is this level unlocked? | A `user_level_progress` row exists with `unlocked_at` set |
| Is this item available to learn? | Its level is unlocked and no progress row exists |
| Has this item been learned? | A progress row exists |

Lesson eligibility is therefore items in unlocked levels with no progress row.

Spec 07 §44's "items are not already learned/enrolled" revalidation becomes a
simple existence check.

Do not blur:

`unlocked`

and:

`learned`

into one state. The distinction lives across two tables, not in a nullable
column.

Do not create progress rows speculatively when a level unlocks. A user with an
unlocked Level 1 and no lessons taken has zero progress rows, and that is
correct.

---

# 26. Progress Versioning

Include a concurrency/version field on progress records.

`version` is a non-null integer defaulting to `0`, incremented on every
authoritative mutation.

This exists to support later protection against:

- stale reviews
- duplicate concurrent submissions
- two-device progress races

The exact review mutation is out of scope.

Do not implement review submission yet.

The schema must simply support future optimistic concurrency or equivalent
database-level protection.

---

# 27. Aggregate Statistics

Store only aggregate progress information needed by the product foundation.

Examples:

- correct count
- incorrect count
- review count
- last reviewed timestamp

Do not create an immutable answer-by-answer review-history system unless a
later product requirement requires it.

Do not store raw learner answer text as aggregate history.

---

# 28. User Level Progress

Create persistent level-unlock state.

At minimum support:

    user_id
    level_id
    unlocked_at
    completed_at
    created_at
    updated_at

`(user_id, level_id)` must be unique.

The important invariant is:

once a level has been legitimately unlocked, the earned unlock persists.

Do not derive the existence of an earned unlock only from current SRS stage
distribution.

The actual 5/6-at-Familiar-1 unlock calculation belongs to later progress
domain operations and is not implemented as a database trigger.

Level 1 is unlocked at provisioning per §11. Every other unlock is earned.

---

# 29. Progress Domain

Create:

`domains/progress/`

with a small public surface.

Conceptually:

    domains/progress/
      index.ts
      types.ts
      repository.ts
      service.ts

Exact structure may follow existing repository conventions.

The progress domain owns persistent learner progress.

It must not expose Drizzle rows directly to React components.

Initial read-oriented capabilities may include:

- get item progress
- get level progress
- determine whether progress exists
- retrieve user progress for a language/level
- list unlocked levels for a user/language

Do not expose arbitrary:

    setSrsStage(...)
    setNextReview(...)
    setUnlocked(...)

APIs to UI code.

Authoritative mutations will later occur through approved lesson/review
workflows.

Every progress query is user-scoped at the repository boundary. A repository
method that can return another user's rows when passed the wrong argument is a
defect, not a caller responsibility.

---

# 30. Curriculum Domain

Create or replace the placeholder curriculum foundation under:

`domains/curriculum/`

It should expose a small public API over repositories.

Initial capabilities should support future consumers such as:

    getLanguage(...)
    getLevel(...)
    getLearningItem(...)
    getLevelItems(...)
    getVocabularyGroup(...)

Exact signatures should be designed around domain types rather than raw
database rows.

Do not implement:

- admin editing UI
- CSV import UI
- full curriculum publishing workflow

in this spec.

---

# 31. Curriculum Domain Types

Application/domain consumers should receive meaningful domain models.

Avoid leaking database implementation details such as:

- Drizzle table objects
- raw column naming
- internal relation mechanics

outside the repository layer.

Use explicit projections where only a subset of data is needed.

Do not use `SELECT *` application queries.

---

# 32. SRS Domain Foundation

Create:

`domains/srs/`

if it does not already exist.

This spec establishes the domain foundation only.

Implement centralized configuration and pure deterministic logic for:

- stage identifiers
- stage ordering
- standard intervals
- early-level accelerated intervals
- due-review eligibility
- next-review calculation

Do not implement the review-session UI or submission endpoint.

---

# 33. SRS Configuration

Create one authoritative SRS configuration.

Do not scatter interval numbers through:

- pages
- components
- repositories
- handlers

The configuration must represent:

- Beginner 1
- Beginner 2
- Beginner 3
- Beginner 4
- Familiar 1
- Familiar 2
- Intermediate
- Master
- Fluent

and the existing configured normal/accelerated intervals.

Use explicit stage identifiers.

Do not infer SRS progression from PostgreSQL enum order.

---

# 34. SRS Time

Pure SRS functions receive an authoritative `now`.

Example concept:

    calculateNextReview({
      stage,
      level,
      now,
      config,
    })

Do not call browser time.

Avoid calling `new Date()` repeatedly inside low-level domain logic.

Tests use fixed timestamps.

Persist timestamps in UTC.

This injected clock is also what makes the sandbox's time simulation possible
later without a schema change. See §73.

---

# 35. SRS Database Ownership

The SRS domain may coordinate authoritative SRS state, but persisted
user-specific values live in progress records.

Do not put:

- srs_stage
- next_review_at
- correct_count

on `learning_items`, `vocabulary_items`, or `grammar_items`.

Official curriculum and learner state remain separate.

---

# 36. No Progress Mutation Endpoints Yet

This spec does NOT expose public progress mutation workflows.

Do not create API endpoints such as:

    POST /api/v1/srs/set-stage
    POST /api/v1/progress/unlock
    POST /api/v1/progress/set-next-review

The learner must never arbitrarily control these values.

Future specs will mutate them only through approved workflows.

This holds despite §53 and §54 landing the idempotency and rate-limit
infrastructure. Those are mechanisms with no user-facing consumer yet.

---

# 37. Database Seed Strategy

Schema migration and curriculum data are separate concerns.

Do not put large curriculum datasets directly inside schema migrations.

Create deterministic fixture seeding for:

- development verification
- preview environments
- integration tests

At minimum test fixtures should include:

- Spanish language, matching the configured default so provisioning works
- at least two levels, so lower-level lesson priority can be tested later
- vocabulary groups
- vocabulary learning items
- grammar learning items
- example sentences
- at least two users where authorization tests require them
- representative progress rows
- representative level-unlock rows
- representative learner notes and synonyms
- one sandbox user owned by a developer user
- representative idempotency key rows

Keep fixture IDs deterministic where that makes tests clearer.

Never copy production user data into fixtures.

---

# 38. Initial Spanish Record

Create a deterministic way to ensure the development/test fixture database
contains the configured Mexican/Latin American Spanish language record, along
with its Level 1.

Provisioning depends on both existing. See §11.

Do not import the entire real Spanish curriculum CSV in this spec.

The production/admin curriculum import workflow belongs to a later feature.

The fixtures should be intentionally small while exercising the actual schema.

---

# 39. Migration Scripts

Add package scripts for normal database operations.

Use clear names such as:

    db:generate
    db:migrate
    db:verify
    db:seed

Exact commands should use the installed Drizzle tooling.

Do not manually edit generated migration SQL unless Drizzle cannot represent a
required change.

Composite foreign keys and partial unique indexes may require this. If manual
SQL is required:

- document why
- keep it isolated
- review it carefully

Never edit a migration that has already been merged/applied as shared history.

---

# 40. Initial Migration

Generate the initial migration from the Drizzle schema.

Review it before committing.

The migration must create the required:

- enums
- tables
- foreign keys
- composite foreign keys
- partial unique indexes
- unique constraints
- check constraints
- indexes

Do not manually create the development database schema as a substitute for the
migration.

The migration history must be capable of rebuilding the schema from empty.

---

# 41. Required Indexes

Add indexes supporting known near-term query paths.

At minimum:

## Users

- partial unique index on `clerk_user_id` where not null
- index on `sandbox_owner_user_id`

## Curriculum

- levels by language + level number
- learning items by language
- learning items by level/type/order
- vocabulary groups by level/order

## Progress

- progress by user
- progress by user + learning item
- **`(user_id, language_id, next_review_at)`** — the due-review path
- progress needed for level-stage aggregates
- `user_level_progress` by user

## Learner Content

- `user_notes` unique on `(user_id, learning_item_id)`
- `user_synonyms` unique on `(user_id, learning_item_id, side, normalized_value)`

## Idempotency

- unique on `(user_id, operation, key)`
- index on `expires_at` for cleanup

The due-review composite index is the reason §24 denormalizes `language_id`.
Without the column on the table, this index cannot exist, because a composite
index cannot span a join to `learning_items`.

Do not add speculative dozens of indexes.

Every added index should correspond to an expected query or constraint.

---

# 42. Integration Test Harness

Create real PostgreSQL integration-test infrastructure.

Integration tests must:

1. require `TEST_DATABASE_URL`
2. connect to that database
3. apply the current migration history
4. seed required deterministic fixtures
5. run independently
6. leave no state that changes subsequent tests

Use either:

- transaction-per-test rollback
- isolated test schemas

depending on which cleanly supports the Neon/Drizzle stack.

Tests must not depend on execution order.

---

# 43. Integration Test Separation

Keep:

- unit tests
- database integration tests

distinguishable.

Do not make every normal unit-test run require a live database if that harms
local development unnecessarily.

Provide a dedicated script such as:

`test:integration`

or the existing project-equivalent.

Normal domain pure-function tests should remain fast and database-free.

Rate-limit tests use the in-memory implementation and require neither a
database nor Upstash. See §54.

---

# 44. CI Neon Test Branch

Implement the database-specific CI foundation needed for integration and
migration verification.

Use an ephemeral Neon branch per relevant CI run / pull request according to
the existing environment architecture.

The workflow should:

1. authenticate to Neon using CI secrets
2. create an isolated branch
3. obtain its database connection string
4. expose it only to the required job as `TEST_DATABASE_URL`
5. apply migrations
6. seed fixtures
7. run integration tests
8. perform migration verification
9. delete the branch during cleanup

Do not expose the test connection string in normal log output.

Do not use the production branch.

Do not clone production user data.

Note the Neon plan's branch limit when configuring concurrency. A per-PR
branch strategy can exhaust the allowance on a busy day; configure branch
expiry as the secondary cleanup.

---

# 45. Migration CI Verification

Database CI must prove at minimum:

## Empty Database

    empty PostgreSQL
        ↓
    all migrations
        ↓
    schema head

must succeed.

## Fixture Database

    migrations
        ↓
    deterministic seed
        ↓
    valid schema + data

must succeed.

Also verify that checked-in Drizzle schema and migration history have not
silently diverged.

Use official Drizzle/PostgreSQL tooling where possible rather than writing
fragile custom migration parsing.

---

# 46. CI Scope

This spec does not need to implement every infrastructure workflow described
by `architecture.md`.

Implement only the CI pieces necessary for:

- database integration tests
- migration application
- migration verification
- ephemeral test database lifecycle

Do not expand this unit into:

- full security scanning
- Playwright deployment verification
- Sentry configuration
- PostHog configuration
- R2 infrastructure
- production backup automation

unless an existing workflow must be minimally adjusted for database checks.

---

# 47. Migration Safety

Follow the migration rules already defined in:

`architecture.md`

and:

`code-standards.md`

Do not restate or fork those rules here.

Important implementation result:

- migrations are explicit
- migrations are committed
- migrations never run at app boot
- merged migrations are immutable
- production strategy remains forward-only
- destructive changes require the existing approval process

This initial migration creates new schema only and should not require a
destructive migration.

---

# 48. Database Errors

Do not expose raw PostgreSQL or Drizzle errors directly to UI users.

Repositories may translate expected database conditions into structured
application/domain errors.

Unexpected database failures should propagate through the project's normal
error handling rather than being swallowed.

Do not return fake empty/success data when authoritative database access fails.

---

# 49. Internal User Integration

Update authenticated server boundaries that genuinely need the internal user
record.

At minimum establish a working path proving:

    Clerk authenticated request
        ↓
    internal user resolution
        ↓
    database role resolution

Do not perform a broad dashboard rewrite in this spec.

If the dashboard currently reads Clerk directly for the greeting, it may
continue doing so until the real dashboard-data spec unless a small change is
required to verify internal-user provisioning.

Avoid mixing Spec 09's aggregation work into this unit.

---

# 50. Dashboard Fixture Boundary

Do not replace:

`domains/dashboard/dashboard-fixtures.ts`

with full real aggregation in this spec.

The current dashboard was intentionally designed so its data backend can be
replaced independently.

A later spec will implement real dashboard aggregation using:

- users
- curriculum
- progress
- SRS
- lessons

Keep that work separate.

---

# 51. No Lesson Domain Implementation

Spec 07 describes future lesson behavior.

Do not implement the lesson session lifecycle here.

Spec 08 only provides the database/domain foundation that lessons will later
consume.

Do not implement:

- lesson batch sessions
- signed ephemeral lesson tokens
- study progression
- lesson quiz state
- retry scheduling
- Beginner 1 enrollment mutation

in this spec.

---

# 52. No Review Session Implementation

Do not implement:

- review queue UI
- review answer submission
- SRS penalties
- bidirectional review transaction
- stale-review endpoint behavior
- leech logic

in this spec.

The schema/domain must support those future behaviors without implementing
them now.

---

# 53. Idempotency Foundation

Implement the idempotency mechanism described by `architecture.md`.

This spec creates the storage and the reusable helper. It exposes no
user-facing progress-affecting mutation — Spec 07 unit 6 is the first consumer.

## Table

Create `idempotency_keys` supporting at minimum:

    id
    user_id
    operation
    key
    request_hash
    status
    response_snapshot
    created_at
    expires_at

Requirements:

- unique on `(user_id, operation, key)`
- `operation` is a stable logical operation name such as `lesson.complete`,
  not a URL
- `key` is the client-generated UUID
- `request_hash` is a stable hash over a canonical serialization of the
  request payload
- `status` uses the values in §8
- `response_snapshot` stores the result needed to replay the original response
- `expires_at` derives from a configured retention window

Do not store raw learner answers, tokens, or credentials in
`response_snapshot`. `architecture.md` forbids sensitive learner content in
this kind of durable side record.

## Helper

Create a reusable server-side helper, conceptually:

    withIdempotency({ user, operation, key, payload }, fn)

Behavior:

1. Compute the request hash.
2. Attempt to insert the key row with status `in_progress`.
3. On successful insert, run `fn` **inside the same transaction**, store the
   result in `response_snapshot`, set status `succeeded`, and commit.
4. On conflict, load the existing row.
5. If the stored `request_hash` differs, reject with a structured error.
6. If it matches and status is `succeeded`, return the stored result without
   re-executing.
7. If it matches and status is `in_progress`, treat it as a concurrent
   duplicate and return a structured error the caller can surface as a retry.

The key row and the effect commit or roll back together. A succeeded key with
no effect, or an effect with no key, is a correctness failure.

## Errors

Add structured errors:

- `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`
- `IDEMPOTENCY_OPERATION_IN_PROGRESS`

## Retention

The retention window is configuration, not a literal.

Provide a cleanup script deleting rows past `expires_at`. Scheduling it is an
operational concern and may be deferred.

## Verification

Because there is no real mutation yet, exercise the helper against a small
database-foundation fixture operation, reusing the §60 transaction fixture. Do
not invent fake lesson or review behavior to test it.

---

# 54. Rate-Limit Provider

Implement the rate-limit provider behind:

`providers/rate-limit`

The backing store is Upstash Redis per §1.

## Structure

    providers/rate-limit/
      index.ts        typed interface + selection
      types.ts
      policies.ts     named policies
      upstash.ts      production/preview implementation
      in-memory.ts    test and credential-free local implementation

Consumers depend only on the interface. No consumer imports `upstash.ts`
directly.

## Policies

Rate-limit policies are named and centralized in `policies.ts`.

Call sites reference a policy name. They never pass raw window and count
numbers.

Define at minimum the policy that progress-affecting mutations will consume.
Additional policies may be added when their consumers exist.

## Fail Closed

Progress-affecting mutations fail closed. If the store is unreachable, the
request is denied.

Any policy that should fail open must declare it explicitly in its own
definition. Fail-open is never the default and never implicit.

## Keys

Namespace keys by `APP_ENV` so preview and production never share buckets.

Identify by internal Polyglot user ID on authenticated routes. IP is a
fallback for unauthenticated routes only.

## Errors

Denials surface as the existing structured `RATE_LIMITED` error.

## Testing

The in-memory implementation is used by all automated tests.

Do not contact Upstash from unit tests, database integration tests, or CI
database jobs. Upstash credentials must not be required for any test run.

## Boundaries

Do not add rate-limit tables, counters, or windows to PostgreSQL.

Do not apply rate limiting to any route in this spec. There is no
user-facing progress-affecting mutation yet. The provider exists and is
tested; wiring happens with its first consumer.

---

# 55. Unit Tests — SRS

Add pure unit tests for the SRS foundation.

At minimum verify:

- stage ordering is explicit
- standard intervals resolve correctly
- Level 1–2 accelerated intervals resolve correctly
- later levels use the standard schedule
- next-review calculation uses injected `now`
- due-review eligibility compares against authoritative supplied time
- Fluent has the configured terminal behavior
- calculations do not rely on browser time
- calculations do not rely on enum ordinal position

Use fixed timestamps.

---

# 56. Unit Tests — Role Helpers

Add tests verifying:

- normal users resolve as `user`
- admin resolves as `admin`
- beta tester resolves correctly
- developer resolves correctly
- allowed role checks pass
- disallowed role checks fail

Do not mock a client-controlled role source as authoritative.

---

# 57. Integration Tests — User Provisioning

Against real PostgreSQL verify:

- first authenticated identity creates one internal user
- repeated resolution returns the same internal user
- concurrent provisioning cannot create duplicate users
- concurrent provisioning cannot create duplicate Level 1 unlock rows
- `clerk_user_id` uniqueness is enforced for non-null values
- multiple sandbox users with null `clerk_user_id` are permitted
- default role is `user`
- default timezone is `UTC`
- `active_language_id` is set to the configured default language
- a Level 1 unlock row is created
- provisioning fails cleanly when the default language is absent
- a half-provisioned user is never left behind after a forced failure
- database role is returned authoritatively
- a Clerk metadata role cannot silently override the DB role

Do not require real Clerk network calls for repository-level integration
tests.

Authenticate/mapping boundaries may use controlled identity fixtures while
the database remains real.

---

# 58. Integration Tests — Curriculum

Verify:

- language uniqueness
- level uniqueness within language
- vocabulary group ordering constraints
- learning item relationships
- vocabulary one-to-one identity
- grammar one-to-one identity
- supporting sentence relationships
- archived/published status storage
- stable learning item identity survives ordinary content updates
- cross-language relationships are rejected by the composite foreign keys
- deleting a learning item referenced by progress is rejected

---

# 59. Integration Tests — Progress

Verify:

- one user/item progress record per combination
- progress for User A is separate from User B
- progress for one language does not affect another language
- a progress row cannot be created with a `language_id` disagreeing with its
  learning item
- SRS state is not stored on curriculum rows
- unlocked-but-not-learned items have no progress row
- level unlock state is independently persistent
- an earned unlock survives a subsequent progress change
- concurrency/version field updates can be checked safely
- due-review lookup uses the composite index and does not scan unrelated users
- deleting a user cascades their progress, notes, synonyms, and idempotency
  rows

Do not implement the actual review mutation yet.

---

# 60. Integration Tests — Transactions

Establish the database testing capability to verify transactions.

Create at least one focused test proving:

- a multi-write transaction commits all writes when successful
- a forced failure rolls back all writes

This verifies that the selected Neon/Drizzle adapter is suitable for future
lesson/review transactional requirements, and is the test that catches an
adapter chosen against §3.

Do not create fake lesson/review production behavior solely to test this.

Use a small database-foundation transaction fixture. §53 reuses it.

---

# 61. Migration Tests

Verify:

- migration applies from an empty database
- migration can seed fixture data successfully
- schema constraints behave as expected
- composite foreign keys exist and are enforced
- partial unique indexes exist and are enforced
- generated schema matches checked-in migration history
- migrations are not executed by importing the normal runtime DB client

---

# 62. Repository Boundary Tests

Where useful, verify repository behavior such as:

- curriculum repositories return domain projections
- progress repository queries are user-scoped
- user repository resolves by internal ID and Clerk ID correctly
- no repository returns another user's private progress accidentally
- no repository returns another user's notes or synonyms
- sandbox users are excluded from normal learner queries

Avoid testing Drizzle itself.

Test Polyglot behavior and boundaries.

---

# 63. Build / Client Safety

Verify no server-only database dependency leaks into the client bundle.

React client components must never import:

- `db/client`
- Drizzle schema internals
- database repositories
- server authorization helpers
- the rate-limit provider

Server Components may call application/domain services when appropriate.

Mark server-only modules appropriately if the project uses a server-only
boundary package/pattern.

---

# 64. Documentation Updates

Update the authoritative context files only where decisions changed.

At minimum resolve the two former open questions:

## Rate Limit

Record:

`Upstash Redis behind providers/rate-limit`

as the selected v1 backing store, and that the provider is implemented.

## Integration Database

Record:

- integration tests consume `TEST_DATABASE_URL`
- CI provisions ephemeral Neon PostgreSQL
- local tests may use Neon or local real PostgreSQL

## New Architecture Decisions

Add ADRs for decisions that outlive this spec:

- progress rows exist only after enrollment; unlock is level-scoped
- `language_id` is denormalized onto `user_item_progress` for the due-review
  index, kept correct by composite foreign key
- the developer sandbox is isolated at the user boundary (§73)

Number these continuing from the highest existing ADR. Spec 07 claims
ADR-017; these follow it.

Do not duplicate the entire Spec 08 into `architecture.md`.

Context documents should contain durable architecture decisions, not
implementation diary details.

---

# 65. Progress Tracker

Update:

`context/progress-tracker.md`

when the feature is complete.

Record durable facts including:

- Drizzle/Neon foundation exists
- initial schema/migration exists
- internal user provisioning exists, including starting state
- DB-authoritative roles exist
- curriculum/progress/SRS domain foundations exist
- learner notes and synonyms exist
- sandbox affordance exists
- idempotency foundation exists
- rate-limit provider exists
- integration PostgreSQL harness exists
- ephemeral Neon CI strategy exists
- dashboard remains fixture-backed pending the next data aggregation spec
- **Spec 07's prerequisites are fully satisfied**

Remove the corresponding resolved open questions.

Do not paste a giant implementation log into the tracker.

Git history owns low-level implementation detail.

---

# 66. Scope Boundaries

Do NOT implement in Spec 08:

- lesson UI
- lesson session logic
- lesson quiz logic
- lesson retry scheduling
- lesson SRS enrollment
- review UI
- review submissions
- review penalties
- review history UI
- leech classification logic
- dashboard real-data aggregation
- admin curriculum UI
- CSV import UI/workflow
- custom decks
- practice modes
- journals
- XP calculations
- rank calculations
- Stripe
- R2 media workflows
- Sentry
- PostHog
- production backup automation
- production role management UI
- production billing/access enforcement
- notes/synonyms editing UI
- sandbox UI or sandbox tooling
- rate limiting applied to any actual route
- any user-facing consumer of the idempotency helper

The last four are the boundary between mechanism and feature. This spec builds
the mechanisms and tests them. It wires none of them to a user.

---

# 67. Expected Implementation Units

This spec is large. Implementation must be split into verifiable units.

Each unit has its own completion criteria and must leave the repository in a
working state.

## Unit 1 — Database Runtime Foundation

- dependencies, including the `neon-serverless` adapter
- typed env
- Drizzle config
- DB client
- migration scripts

**Done when:** the client connects to a real development database, scripts run,
no migration executes on import, and `db/client.ts` is not importable from a
client component.

## Unit 2 — Core Schema

- users, languages, curriculum, progress
- learner content and idempotency tables
- composite foreign keys, partial unique indexes, referential actions
- initial migration

**Done when:** the migration applies to an empty database, §61 passes, and the
generated schema matches the checked-in history.

## Unit 3 — Internal User, Roles, Starting State, Sandbox

- user repository
- Clerk → Polyglot resolver
- provisioning starting state per §11
- sandbox affordance per §73
- authoritative role helpers

**Done when:** §56 and §57 pass, including the concurrency and
failed-provisioning cases.

## Unit 4 — Curriculum, Progress, Learner Content Repositories

- curriculum domain
- progress domain
- notes and synonyms repositories
- deterministic fixtures

**Done when:** §58, §59, and §62 pass, and no repository can return another
user's rows.

## Unit 5 — SRS Domain Foundation

- stage configuration
- interval calculations
- due/next-review pure logic

**Done when:** §55 passes with fixed timestamps and no database dependency.

## Unit 6 — Idempotency Foundation

- table, helper, structured errors, retention config, cleanup script

**Done when:** §74's idempotency tests pass, including concurrent duplicates
and payload mismatch, and the key commits atomically with its effect.

## Unit 7 — Rate-Limit Provider

- interface, policies, Upstash implementation, in-memory implementation

**Done when:** §74's rate-limit tests pass using the in-memory implementation
with no Upstash credentials present, and fail-closed behavior is verified.

## Unit 8 — Integration DB + CI

- `TEST_DATABASE_URL` harness
- migration test helper
- Neon ephemeral CI branch lifecycle
- migration verification

**Done when:** CI creates a branch, migrates, seeds, runs integration tests,
verifies migrations, and deletes the branch, including on failure.

Do not merge unrelated work into a unit merely to finish the whole spec in one
session.

---

# 68. Verification

Before marking a completed implementation unit done, run every applicable
check required by the existing workflow.

At minimum:

- TypeScript/typecheck
- lint
- unit tests
- relevant integration tests
- `npm run test`
- `npm run build`

For database units also run:

- migration generation/check
- migration application
- database integration tests
- schema/migration verification

If the environment does not currently provide `TEST_DATABASE_URL` or required
Neon CI secrets, do not claim database integration verification passed.

State exactly what could and could not be run.

---

# 69. Database Verification

Using a real development/test PostgreSQL database, verify:

1. Empty database can migrate to head.
2. Fixture seed succeeds.
3. Internal user can be created with its full starting state.
4. Duplicate Clerk user cannot be created.
5. Multiple sandbox users with no Clerk ID can coexist.
6. Role resolution reads Neon.
7. Spanish language record exists.
8. Levels/groups/items can be queried.
9. Vocabulary and grammar reference shared learning-item identity.
10. Progress references the shared learning-item identity.
11. User A's progress cannot be confused with User B's.
12. Cross-language rows are rejected.
13. SRS stage and next-review fields persist correctly.
14. Level unlock state persists independently.
15. Notes and synonyms persist and remain private.
16. Sandbox progress is excluded from normal learner queries.
17. Transactions commit atomically.
18. Forced transaction failure rolls back.
19. An idempotency key and its effect commit or roll back together.
20. Integration tests clean up after themselves.

---

# 70. No Major Visual Verification Required

This feature is primarily backend/database infrastructure.

A full visual redesign/browser pass is not required unless implementation
changes an existing user-visible authenticated flow.

If internal-user resolution is integrated into an existing page, perform a
small browser verification proving:

- signed-out protection still works
- signed-in resolution succeeds
- no new hydration/runtime errors appear
- existing dashboard UI remains intact

Do not spend this spec redesigning the dashboard.

---

# 71. Completion Criteria

Each unit closes against its own criteria in §67.

Spec 08 as a whole is complete when:

## Runtime and schema

- Neon PostgreSQL is connected through the approved server database boundary
- the `neon-serverless` adapter is in use and transactions demonstrably work
- Drizzle ORM is configured
- schema is split cleanly by domain
- initial migration is generated and committed
- migration history rebuilds the schema from empty
- migrations do not run during app startup
- referential actions are explicit on every foreign key
- `updated_at` is maintained on write

## Users and roles

- internal Polyglot users exist
- Clerk identity maps safely to internal users
- concurrent first-user provisioning cannot duplicate users
- new users receive a default language and a Level 1 unlock
- timezone defaults to UTC and is never null
- roles exist as database-authoritative values
- role helpers read the database
- users cannot assign themselves roles
- sandbox users are isolated at the user boundary and excluded from learner
  queries

## Curriculum

- Spanish is represented as a real language record
- levels are language-scoped
- vocabulary groups have explicit ordering
- learning items have stable shared identity
- vocabulary and grammar use type-specific tables
- official sentences can relate to learning items
- official content contains no learner state
- cross-language relationships are impossible via composite foreign keys

## Progress

- progress rows exist only after enrollment and `srs_stage` is not null
- unlock and learned are distinct states across two tables
- user level unlock state persists independently
- progress supports concurrency/version protection
- `language_id` is denormalized and the due-review composite index exists
- learner notes and synonyms persist and stay private

## SRS

- explicit SRS stage identifiers exist
- SRS configuration is centralized
- SRS timing logic uses injected authoritative time
- accelerated early-level timing is supported

## Mutation infrastructure

- the idempotency table and helper exist
- keys commit transactionally with their effect
- payload mismatch and concurrent duplicates are rejected
- the rate-limit provider exists behind `providers/rate-limit`
- Upstash backs it in production; in-memory backs it in tests
- progress-affecting policies fail closed
- no rate-limit tables were added to PostgreSQL
- neither mechanism is wired to a user-facing route yet

## Testing and operations

- deterministic test fixtures exist
- real PostgreSQL integration tests exist
- integration tests use `TEST_DATABASE_URL`
- CI database testing uses ephemeral Neon
- no integration test touches production data
- no test requires Upstash credentials
- migration CI verification exists
- dashboard remains intentionally fixture-backed
- lessons/reviews remain out of scope
- typecheck passes
- lint passes
- unit tests pass
- integration tests pass where database environment is available
- build passes
- migration verification passes
- `progress-tracker.md` is updated
- Spec 07's Prerequisites table is updated to show no remaining blockers

---

# 72. Learner-Owned Content

`architecture.md` lists notes and synonyms as user-owned, private by default.
Spec 07 §15 and §16 render user notes in lesson content, and Spec 07 §24
requires accepting user-created synonyms during answer checking.

Create both tables now so those consumers have somewhere to read from.

No editing UI is in scope. Repositories, fixtures, and tests only.

## user_notes

    id
    user_id
    learning_item_id
    body
    created_at
    updated_at

- unique on `(user_id, learning_item_id)` — one note per item per user
- cascade from `users`, restrict from `learning_items`
- never returned for any user other than the owner

## user_synonyms

    id
    user_id
    learning_item_id
    side
    value
    normalized_value
    created_at
    updated_at

- `side` uses the values in §8: `term` for an accepted target-language form,
  `meaning` for an accepted English meaning
- unique on `(user_id, learning_item_id, side, normalized_value)`
- cascade from `users`, restrict from `learning_items`

`side` exists because Spec 07 §23 tests vocabulary in both directions. A
synonym accepted for `gato → cat` is not necessarily acceptable for
`cat → gato`, and a single untyped synonym list cannot express that.

## Normalization

Store both the learner's original `value` and a `normalized_value`.

Normalization is performed by a shared module that the future centralized
answer checker (Spec 07 §24) will also consume. Create that module here even
though its only current caller is this table.

Do not implement answer similarity, fuzzy matching, or tolerance in this spec.
Only deterministic normalization — case, whitespace, and accent handling
consistent with the language configuration.

## Privacy

Notes and synonyms are private learner content.

They must never appear in analytics events, error monitoring, or logs, in the
same way typed answers must not.

---

# 73. Developer Sandbox Affordance

`architecture.md` requires the admin/developer sandbox to be completely
isolated from production learner progress, with a sandbox-specific clock.

Building the sandbox is out of scope. Deciding its schema shape is not,
because retrofitting isolation later would touch every progress table.

## Decision

Isolate at the **user boundary**.

A sandbox is a separate user row owned by a real developer:

    users.is_sandbox              boolean not null default false
    users.sandbox_owner_user_id   uuid null references users(id) on delete cascade

Constraints:

- a check constraint requiring `sandbox_owner_user_id IS NOT NULL` when
  `is_sandbox` is true, and `IS NULL` when false
- `clerk_user_id` is null for sandbox users, which is why §9 makes it nullable
  with a partial unique index

## Why this shape

Every progress, note, synonym, and unlock row already hangs off `user_id`.
Routing sandbox state through a sandbox user therefore inherits complete
isolation from constraints that already exist, with two columns and no changes
to any progress table.

The alternatives are worse. A per-row `is_sandbox` flag on every progress table
means every query everywhere must remember to filter it, and one forgotten
filter corrupts real learner data. A separate PostgreSQL schema duplicates the
entire migration history.

## Query rule

Normal learner queries, aggregates, and dashboard data exclude users where
`is_sandbox` is true.

Enforce this at the repository boundary, not at call sites, and cover it in
§62.

## Clock

Sandbox time simulation needs no schema. §34's injected `now` already provides
the seam. A sandbox context supplies a different clock to the same pure SRS
functions.

## Not in scope

- sandbox UI
- sandbox seeding tools
- arbitrary stage setting
- time travel controls
- sandbox reset

Only the columns, constraints, the exclusion rule, and fixtures proving they
work.

---

# 74. Tests — Idempotency and Rate Limiting

## Idempotency

Against real PostgreSQL verify:

- a first call executes the operation and records a succeeded key
- a repeat with the same key and payload returns the stored result without
  re-executing
- a repeat with the same key and a different payload is rejected
- two concurrent calls with the same key execute the operation exactly once
- a failure inside the operation rolls back both the effect and the key row
- keys are scoped per user; the same key from a different user is independent
- keys are scoped per operation
- `response_snapshot` contains no learner answer content
- expired keys are removed by the cleanup script

## Rate Limiting

Using the in-memory implementation, verify:

- requests under the policy limit pass
- requests over the limit are denied with `RATE_LIMITED`
- windows reset as configured
- keys are namespaced by `APP_ENV`
- authenticated identification uses the internal user ID
- a store failure denies a fail-closed policy
- a store failure allows a policy that explicitly declares fail-open
- no test run requires Upstash credentials
- no rate-limit state reaches PostgreSQL

---

# 75. Tests — Learner Content and Sandbox

## Learner Content

Verify:

- one note per user per learning item
- a second note for the same pair is rejected
- duplicate synonyms for the same user, item, and side are rejected
- the same normalized synonym on opposite sides coexists
- notes and synonyms cascade on user deletion
- deleting a learning item with notes or synonyms is rejected
- one user's notes and synonyms are never returned for another user
- normalization is deterministic and shared

## Sandbox

Verify:

- a sandbox user requires an owner
- a non-sandbox user cannot have an owner
- multiple sandbox users coexist with null Clerk IDs
- sandbox progress does not appear in normal learner queries
- deleting the owning developer cascades their sandbox users
- the injected clock allows sandbox SRS calculation without altering server
  time

---

# Final Implementation Shape

At completion, the architecture should resemble:

    Clerk
      |
      v
    auth domain
      |
      v
    internal Polyglot user ----+--> sandbox users (owned, isolated)
      |                        |
      |                        +--> user_notes
      |                        |
      |                        +--> user_synonyms
      |
      +---------------------------+
      |                           |
      v                           v
    curriculum                  progress
      |                           |
      v                           v
    learning_items <------- user_item_progress
      |                           |
      +--> vocabulary             +--> SRS stage
      |                           |
      +--> grammar                +--> next review
      |                           |
      +--> sentences              +--> statistics
                                  |
                                  +--> version

                     srs domain
                         |
                         v
              centralized pure rules
                         |
                         v
              authoritative progress
              mutations in later specs
                         ^
                         |
              guarded by idempotency_keys
              and providers/rate-limit

Database access remains:

    UI / Routes
         |
         v
    Application Services
         |
         v
       Domains
         |
         v
    Repositories
         |
         v
    Drizzle / Neon PostgreSQL

No layer may bypass that dependency direction merely because direct Drizzle
access is convenient.