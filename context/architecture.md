# Architecture Context

## Architecture Style

Polyglot uses a **modular monolith** architecture.

The application is deployed as one Next.js application with one primary PostgreSQL database, but the codebase is divided into strict domain boundaries. UI components, route handlers, and server actions must delegate learning behavior to reusable application/domain services rather than implementing curriculum, SRS, unlock, or progress rules directly.

This provides a simple v1 deployment while keeping core business logic reusable by future clients such as mobile applications or a public API.

### Runtime Topology

```text
Browser
  |
  v
Next.js App Router application on Vercel
  |
  +--> Application / domain services
  |       |
  |       +--> Drizzle ORM --> Neon PostgreSQL
  |       +--> Media provider --> Cloudflare R2
  |       +--> Speech provider --> Web Speech API
  |
  +--> Clerk authentication
  +--> Sentry error monitoring
  +--> PostHog product analytics
```

There is no independently deployed backend service in v1.

A separate backend may be introduced later if multiple clients or scaling requirements justify it. Core business logic must therefore remain independent from React components and transport-specific code.

---

## Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Framework | Next.js App Router | Full-stack web application |
| Language | TypeScript | Application language |
| Package Manager | npm | Dependency and script management |
| UI | React | User interface |
| Styling | Tailwind CSS | Styling system |
| Components | shadcn/ui | Base component library |
| Authentication | Clerk | Identity, sign-in, sign-out, account authentication |
| Database | Neon PostgreSQL | Authoritative persistent application data |
| ORM | Drizzle ORM | Schema, migrations, and database access |
| Validation | Zod | Runtime validation at system boundaries |
| Hosting | Vercel | Application deployment |
| Media Storage | Cloudflare R2 | Persistent audio, images, and learning media |
| Speech Recognition | Web Speech API behind provider interface | v1 speaking transcription |
| Error Monitoring | Sentry | Application and server error monitoring |
| Product Analytics | PostHog | Product usage analytics |

---

## Core Dependency Rule

The preferred dependency direction is:

```text
UI / Routes / Server Actions
        |
        v
Application Services
        |
        v
Domain Logic
        |
        v
Repositories / Providers
        |
        v
Database / External Services
```

Higher layers may depend on lower layers.

Lower layers must not depend on UI components, route handlers, or page-specific code.

### Business Logic Location

The following rules must live in centralized domain/application modules:

- SRS stage transitions
- Review scheduling
- Review eligibility
- SRS penalties
- Lesson eligibility
- Lesson priority
- Level unlock calculations
- Practice unlock calculations
- Test unlock calculations
- XP calculation
- Streak calculation
- Access-tier evaluation
- Duplicate detection
- Curriculum validation

These rules must not be reimplemented independently in pages, components, route handlers, or server actions.

---

## Application Entry Points

Polyglot uses a mixture of Server Actions and route handlers.

### Server Actions

Use Server Actions for first-party application mutations closely tied to the web UI when they provide a simpler implementation.

Examples:

- Profile updates
- Settings changes
- Dashboard configuration
- Administrative form submissions

### Route Handlers

Use route handlers when an operation:

- Represents an API-like boundary
- Needs explicit HTTP semantics
- May be called by future mobile/external clients
- Handles uploads or provider callbacks
- Benefits from a stable versioned contract

External-facing APIs should use a versioned namespace such as:

```text
/api/v1/*
```

Server Actions and route handlers must call the same application/domain services. Neither may contain duplicated business rules.

---

# System Boundaries

## `auth`

Owns:

- Clerk integration
- Authentication helpers
- Session-to-user resolution
- Role/permission resolution
- Authorization guards

Does not own:

- Polyglot profile data
- Curriculum progress
- SRS state

## `users`

Owns:

- Polyglot user profile
- User settings
- User timezone
- Active language
- Profile picture metadata
- Bio and country
- Account reset workflows

## `languages`

Owns:

- Supported language records
- Language configuration
- Language capabilities
- Language-specific feature configuration
- Active-language context

Language identifiers must be data-driven. Application logic must not assume `"spanish"` is the only possible language.

## `access`

Owns:

- Access-tier definitions (`free`, `premium`)
- Level-to-tier mapping configuration
- Access-tier evaluation for a given user/level
- Future Stripe subscription/entitlement state

Does not own:

- Curriculum content
- SRS state
- Payment-provider integration details (kept behind a provider boundary when Stripe is introduced)

During the v1 beta, `access` evaluates every authenticated user as fully entitled. At production launch, it begins enforcing the premium gate at Level 4+, except for the `beta-tester` role, which remains fully entitled.

## `curriculum`

Owns:

- Levels
- Vocabulary groups/themes
- Vocabulary
- Grammar
- Intermissions
- Sentences used as official learning/supporting content
- Kanji and radicals for future languages
- Curriculum ordering
- Curriculum validation
- Curriculum publish/archive state
- Curriculum duplicate detection

## `lessons`

Owns:

- Lesson availability
- Lesson priority queue
- Lesson batch selection
- Lesson completion rules
- Lesson comprehension-check rules
- SRS enrollment after successful lesson completion

## `srs`

Owns:

- SRS stages
- Review schedule configuration
- Review availability
- Stage changes
- Incorrect-answer penalties
- Next-review calculation
- Leech classification inputs
- Atomic review-item completion

No other domain may directly mutate core SRS state.

## `progress`

Owns:

- User-to-item progress
- User level progress
- Permanent unlock state
- Skill-specific progression
- SRS statistics presented on item pages
- Unlock dates
- Fluent/completion dates

## `practice`

Owns:

- Speaking
- Listening
- Reading
- Sentence practice
- Verb conjugation
- Free study
- Skill-specific progression rules

Verb conjugation practice references the base verb's existing vocabulary item rather than storing conjugated forms as separate curriculum items. Conjugation-practice progress is tracked separately from the base verb's core SRS state.

Practice may read core curriculum and SRS data but may not mutate core SRS state unless explicitly routed through the `srs` domain.

## `tests`

Owns:

- Test definitions
- Module tests
- Theme tests
- CEFR-oriented tests
- Test availability
- Test unlocks
- Test scores
- Retakes
- Test history

Tests do not directly modify core SRS stages.

## `journal`

Owns:

- Journal entries
- Journal history
- Future AI correction integration

Journal content must not be emitted into analytics or error logs.

## `decks`

Owns:

- Admin-authored default decks
- User-created decks (deferred beyond v1)
- Imported decks (deferred beyond v1)
- Deck-only learning items
- Deck duplicate validation
- Deck study progress
- Future deck sharing

Default decks reference canonical official curriculum items. Deck study progress, whether from default or custom decks, is independent from official curriculum progress.

## `dashboard`

Owns:

- Dashboard widget definitions
- User widget configuration
- Dashboard aggregation/read models
- Review forecast presentation data
- Progress summary data

The dashboard does not calculate authoritative SRS or unlock state itself.

## `gamification`

Owns:

- XP
- Rank
- Streaks
- Achievements
- Badges

Future leaderboards and tournaments may depend on this domain but are not part of v1.

## `admin`

Owns:

- Curriculum management workflows
- CSV import orchestration
- Curriculum preview/validation
- Administrative audit events
- Sandbox tools
- Admin-only support interfaces

## `media`

Owns:

- R2 object metadata
- Permanent pronunciation audio
- Images
- Future generated media
- Media-provider abstraction

## `analytics`

Owns:

- PostHog integration
- Event naming
- Allowed analytics properties
- Product usage events
- Analytics privacy rules

---

# Suggested Code Organization

```text
src/
  app/                    # Next.js routes, layouts, route handlers
  components/
    ui/                   # shadcn/ui generated/base components
    shared/               # reusable application UI
  domains/
    auth/
    users/
    languages/
    access/
    curriculum/
    lessons/
    srs/
    progress/
    practice/
    tests/
    journal/
    decks/
    dashboard/
    gamification/
    admin/
    media/
    analytics/
  db/
    schema/
    migrations/
    client.ts
  lib/
    validation/
    errors/
    time/
    logging/
  providers/
    speech/
    storage/
    analytics/
    monitoring/
```

Each domain should expose a small public surface rather than allowing arbitrary cross-domain imports from internal files.

---

# Authentication and User Model

## Authentication

Clerk is responsible for:

- Sign-up
- Sign-in
- Sign-out
- Account identity
- Authentication sessions
- Account credentials

Credentials must not be duplicated in the Polyglot database.

## Internal User Record

Every authenticated Clerk user receives a corresponding Polyglot user record.

The Clerk user ID is stored as the external identity reference.

Application-specific data lives in Neon.

Examples:

- Profile
- Bio
- Country
- Timezone
- Active language
- XP
- Rank
- Preferences
- Dashboard configuration

## Roles

Initial roles:

- `user` — normal learner; access governed by the standard access-tier rules
- `admin` — manages official curriculum and administrative workflows
- `beta-tester` — retains unrestricted full curriculum access regardless of access-tier gating, including after production billing launches; used to grant early-access users permanent free access
- `developer` — free access to the isolated admin/developer sandbox to test any curriculum level, SRS state, or unlock behavior without affecting real learner data

The Polyglot database is authoritative for roles and permissions.

Clerk metadata may mirror role information for convenient UI or route gating, but sensitive server operations must verify the authoritative database role.

An admin may also use Polyglot as a normal learner.

Developer-only tools may be restricted separately from normal administrative content-management features.

## Ownership

Users may mutate only authorized resources that belong to them.

Examples:

- Their profile
- Their settings
- Their notes
- Their synonyms
- Their decks
- Explicit reset operations exposed by the product

Users may **not arbitrarily edit their own SRS stage, review times, XP, unlocks, or learning progress**.

Progress changes occur only through approved domain workflows such as lessons, reviews, practices, tests, or explicit reset operations.

User-added notes and synonyms are private by default.

---

# Multi-Language Model

Polyglot is Spanish-first but not Spanish-hardcoded.

## Language Ownership

Every official curriculum object must be scoped to a language.

Examples:

```text
language
  -> levels
  -> groups/themes
  -> learning items
  -> grammar
  -> sentences
  -> tests
  -> practice content
```

User progress must also be scoped to a language.

Progress in Language A must never alter progress in Language B.

## Active Language

The user's active language is stored in their Polyglot settings and may also be mirrored locally for responsive UI behavior.

The persistent database value is authoritative.

Switching active languages changes application context only. It does not reset, transform, or merge progress.

## Timezone

Each user stores an IANA timezone identifier, for example:

```text
America/Phoenix
America/Mexico_City
Asia/Tokyo
```

The application may detect an initial timezone from the browser.

Users may override it in Settings.

Absolute review timestamps are stored in UTC.

Review intervals are based on absolute elapsed time, not local wall-clock time.

The user's timezone is used for:

- Displaying review times
- Calendar-based UI
- Streak day boundaries
- Daily statistics
- Future reminder scheduling

Changing timezone does not make a review become due early.

---

# Curriculum Model

## Shared Learning Identity

Polyglot uses a shared base learning-item identity plus separate type-specific tables.

Conceptually:

```text
learning_items
  id
  language_id
  type
  status
  ordering metadata
  ...

vocabulary_items
  learning_item_id
  vocabulary-specific fields
  ...

grammar_items
  learning_item_id
  grammar-specific fields
  ...

kanji_items
  learning_item_id
  ...

radical_items
  learning_item_id
  ...
```

Vocabulary and grammar remain separate domain/table structures while sharing stable identity and common relationships where appropriate.

## Permanent Identity

Every official learning item receives a stable permanent ID.

Moving an item between:

- Levels
- Themes
- Groups

must not create a new learning item.

Editing display content must not create a new learning item.

Existing user progress remains associated with the stable item ID.

An admin may explicitly request a progress reset after a substantial curriculum change. It must never occur silently.

## Item Lifecycle

Official curriculum items support lifecycle states such as:

- `draft`
- `published`
- `archived`

Published items referenced by user progress should normally be archived rather than physically deleted.

Permanent deletion is allowed only when referential integrity proves nothing depends on the record.

## Ordering

Curriculum order is explicit and data-driven.

Do not rely on database insertion order.

Ordering may include:

- Level number
- Group/theme position
- Item position
- Lesson priority

## Universal Curriculum Validation

The initial curriculum rule is:

- 48 vocabulary items per level
- 4 vocabulary groups
- 12 vocabulary items per group
- 12 grammar items per level

These are **validation/configuration rules**, not rigid database schema assumptions.

The database must support future configuration changes without requiring a schema redesign.

---

# Duplicate Detection

Duplicate detection is language-scoped.

## Normalization

Duplicate comparison should normalize:

- Leading/trailing whitespace
- Case
- Unicode representation

Normalization must **not remove meaningful diacritics or accents**.

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

are distinct terms.

Accent-only or otherwise suspicious near-matches may be flagged for administrative review.

## Homonyms

Exact normalized written forms may legitimately represent different senses.

When an exact normalized match already exists:

1. Flag the new item as a duplicate candidate.
2. Show the existing matching item(s) to the admin.
3. Block silent creation.
4. Allow an admin to explicitly approve the new record as a legitimate separate sense/homonym.

The approval must be deliberate and auditable.

## CSV Import

CSV import uses:

```text
Upload
  -> Parse
  -> Validate
  -> Preview
  -> Resolve warnings/errors
  -> Confirm
  -> Commit
```

Valid rows may be imported even when other rows contain validation errors.

Invalid rows remain uncommitted and are reported to the admin.

The final commit for each accepted import batch must be transactional so a database failure does not leave a partially committed accepted batch.

---

# Official Content vs User Progress

Official curriculum data and individual user learning state are always separate.

Example:

```text
vocabulary item
  gato
  meaning
  article
  examples
  audio
```

is official curriculum data.

```text
user item progress
  user_id
  item_id
  srs_stage
  unlocked_at
  next_review_at
  fluent_at
  statistics
```

is learner-specific data.

Core SRS state must never be stored directly on the shared curriculum item.

## Item Page Projection

An item page may display both:

1. Official item content
2. The current user's progress projection

The progress section may show:

- SRS stage
- Statistics
- Unlock date
- Next review
- Fluent/completion date
- Speaking progress
- Listening progress
- Other skill progress

These values remain owned by progress records, even though they are displayed on the curriculum item page.

---

# Skill Progression

Core SRS progress and skill-practice progress are separate.

Common visible skill stages:

```text
Beginner
Familiar
Intermediate
Master
Fluent
```

Speaking, listening, reading, sentence practice, and other skills may use these common labels.

Skill-stage labels are displayed to the learner using the active language's translated terms (for example, Spanish equivalents) rather than the English SRS stage names, to avoid confusing skill-practice stages with core SRS stages that use the same English words. Translated stage labels are language-configuration data, not hardcoded strings.

Each practice type may define different configurable advancement requirements.

Example:

```text
Speaking:
5 qualifying successes -> next stage

Listening:
different configured threshold -> next stage
```

Skill thresholds must not be assumed to be identical across practice types.

---

# SRS Architecture

## Authoritative Time

The server is authoritative for review eligibility.

A review is due only when:

```text
current_server_time >= next_review_at
```

The browser clock is never trusted for authoritative scheduling.

All persisted timestamps use UTC.

## SRS Configuration

SRS schedules are configuration-driven.

Configuration includes:

- Stage definitions
- Stage ordering
- Standard intervals
- Early-level accelerated intervals
- Penalty factors
- Minimum-stage behavior
- Level-unlock threshold stage

Do not scatter interval literals throughout the application.

## Review Direction Rules

For bidirectional vocabulary/grammar reviews:

- The item advances only if all required directions are correct.
- An incorrect required direction causes the applicable SRS penalty.
- Half-completed review items do not change SRS state.

## Review Transaction Boundary

The atomic transaction boundary is **one completed review item**.

When all required directions for an item are complete, one transaction performs the authoritative mutation.

The transaction includes all applicable changes such as:

- Validate the review is still due
- Validate current progress/version
- Calculate new SRS stage
- Calculate next review time
- Update aggregate statistics
- Save stage/unlock/completion timestamps
- Persist resulting progress

Either all of those changes for that completed item commit, or none do.

## Review Session Exit

Completed review items remain saved immediately.

If a session contains:

```text
gato   -> complete
perro  -> complete
casa   -> only one required direction complete
```

and the user exits:

- `gato` remains saved
- `perro` remains saved
- `casa` remains due with no SRS stage change

The entire review session is not one large transaction.

## Concurrent Review Protection

If the same due item is opened on two devices:

- The first valid completion may update progress.
- A stale second completion must not apply the same due review twice.
- The second request should return a structured stale/not-due result.

Use database-level concurrency protection or optimistic version checks so duplicate advancement cannot occur.

## Review History

Polyglot stores aggregate/statistical review information required by the product.

A complete immutable answer-by-answer review history is not required by the current product specification.

Analytics and progress statistics should be designed so they do not require storing sensitive typed answer content.

---

# Lesson Architecture

Lessons are intentionally **ephemeral**.

## Lesson Session Persistence

Lesson sessions are not persisted for recovery.

If the user:

- Refreshes the page
- Navigates away
- Closes the tab/browser
- Exits the lesson

the unfinished lesson session is discarded.

The lesson must be restarted.

## Lesson Completion

Viewing lesson material never creates SRS progress.

Items enter SRS only after the **entire lesson session's comprehension quiz is successfully completed**.

Because incorrect lesson answers reappear until answered correctly, the session does not have a fail state.

If a lesson is exited before the entire quiz is complete:

- No lesson items enter SRS.
- No partial lesson completion is saved.
- The selected items remain eligible for a future lesson.

## Lesson Completion Transaction

At final lesson completion, the server must revalidate:

- User identity
- Language
- Item eligibility
- Item availability
- Items are not already learned/enrolled
- Curriculum state

The full lesson batch should enter initial SRS state as one completion operation.

If the final enrollment transaction fails, no subset of the batch should silently enter SRS.

## Lesson Priority

Lesson availability and priority are calculated server-side.

Lower unlocked curriculum levels receive priority over higher unlocked levels.

Custom lesson sessions may select specific currently eligible items but cannot bypass normal availability or curriculum gates.

---

# Level Unlock Architecture

The default progression rule is configuration-driven.

A level unlocks when approximately five-sixths of its gating SRS items have reached at least **Familiar 1**.

Default threshold:

```text
unlock_ratio = 5 / 6
minimum_stage = Familiar 1
```

For a standard 60-item level, this results in 50 qualifying items.

The system must calculate the requirement from the configured ratio and actual gating-item count rather than hardcoding `50`.

Intermissions are not SRS gating items.

Once a level is legitimately unlocked, it remains unlocked even if earlier items later fall below Familiar 1.

Unlocks must therefore have persistent earned state rather than being derived only from the learner's current momentary SRS distribution.

Practice and test unlocks use the same configuration-driven philosophy.

Examples such as:

- Theme tests after Level 5
- CEFR tests after Level 10

must be stored as explicit rules/configuration rather than scattered `if level >= X` conditionals.

---

# Custom Deck Architecture

Custom decks are separate from official curriculum progression.

## Existing Official Item

If a user adds an item that already exists as a canonical official item, the deck should reference that canonical item when possible.

## Deck-Only Item

If the term does not exist in official curriculum:

- Do not create a new official curriculum item.
- Store the content only as a deck-owned custom item.
- Keep it separate from official curriculum tables/state.

## Progress Isolation

Deck study progress must not modify official curriculum SRS progress.

Custom-deck SRS/progress belongs to the deck domain.

Deck duplicate validation follows the applicable language/deck/import duplicate rules.

Future deck sharing is allowed by the architecture but is not required in v1.

---

# Media Architecture

## Permanent Media

Cloudflare R2 stores permanent media such as:

- Pronunciation audio
- Item images
- Future generated learning media

Neon stores metadata and object references, not the media binary itself.

Example metadata:

```text
object_key
mime_type
size
duration
created_at
```

## Speech Recordings

Speaking-practice microphone recordings are temporary.

They must never be persisted to permanent R2 storage.

Temporary audio should be released as soon as the recognition workflow no longer needs it.

---

# Speech Recognition Provider

Speaking practice uses a provider abstraction.

Conceptually:

```ts
interface SpeechRecognitionProvider {
  recognize(...): Promise<{
    transcription: string
    passed: boolean
  }>
}
```

Expected-answer similarity is calculated internally by Polyglot rather than being coupled to a provider-specific similarity score.

The initial provider uses the browser Web Speech API.

v1 may support speaking recognition only where the browser provides the required capability.

Unsupported browsers must receive a graceful fallback or clear unsupported-feature message rather than crashing the practice flow.

The provider abstraction must allow a future cloud speech-recognition service to replace or supplement Web Speech without rewriting the speaking domain.

---

# Demo Architecture

Demo mode uses temporary server-side demo sessions.

Demo state is isolated from authenticated learner progress.

Demo mode:

- Reads the real Level 1 curriculum
- Does not duplicate curriculum records
- Does not write to authenticated user progress tables
- Does not modify real accounts
- Expires/disappears when the temporary demo session ends

Demo-only progress may exist temporarily for the experience but must remain isolated.

---

# Admin Sandbox

The admin/developer sandbox is completely isolated from production learner progress.

Sandbox capabilities may include:

- Simulate any curriculum level
- Set arbitrary sandbox SRS stages
- Make sandbox reviews immediately due
- Unlock practices
- Unlock tests
- View unlock behavior
- View onboarding
- Preview animations
- Simulate future time
- Reset sandbox state

Sandbox operations must never mutate real learner progress.

Sandbox time simulation must use a sandbox-specific clock abstraction and must never change application-wide/server time.

Admins may eventually receive support tools that inspect real-user progress, but direct real-user inspection/support tooling is not part of the current v1 scope.

---

# Access Tiers and Future Billing

The architecture models access tiers before Stripe is introduced.

Initial curriculum access tiers:

```text
free
premium
```

Levels/content should reference access policy rather than hardcoding checks such as:

```ts
level <= 3
```

Levels 1-3 are configured as free-tier curriculum. Later curriculum (Level 4+) is marked premium.

During the v1 beta, access enforcement is configured so all authenticated users may access all currently available curriculum regardless of tier. This is a deliberate beta-testing configuration, not a bug — there is no paying customer yet, so the premium gate stays open.

At production launch, Stripe billing is introduced and the same entitlement service begins enforcing the premium gate at Level 4+ without requiring curriculum restructuring.

Users with the `beta-tester` role keep full access permanently, even after the premium gate activates at launch.

Payment-provider logic must remain outside curriculum and SRS domains.

---

# Caching

Curriculum and other shared read-heavy data may be cached.

Examples:

- Vocabulary definitions
- Grammar explanations
- Published curriculum structure
- Static practice definitions

Admin edits must explicitly invalidate affected caches.

Authoritative user learning decisions must not rely on stale cache values.

Do not use stale cached state to determine:

- Whether a review is due
- Current SRS stage
- Lesson eligibility
- Level unlocking
- Progress mutation
- Access authorization

The authoritative persisted learning state comes from Neon.

---

# Background Work

There is no dedicated background-job/queue system in v1.

Normal SRS scheduling does not require a job.

Reviews become due through timestamp comparison:

```text
next_review_at <= current_server_time
```

Potential future background workloads include:

- Large CSV imports
- Bulk media processing
- Email/push reminders
- AI processing
- Analytics aggregation

If these workloads become necessary, introduce a queue/background-processing boundary rather than placing long-running work inside normal request handlers.

---

# Validation and Error Model

All untrusted input must be validated at runtime.

Use Zod or equivalent boundary schemas for:

- Forms
- Server Actions
- API requests
- CSV imports
- URL parameters
- External provider responses
- Administrative mutations

TypeScript compile-time types are not sufficient validation for external/untrusted data.

## Structured Errors

Expected application/domain failures should use predictable codes.

Examples:

```text
UNAUTHENTICATED
FORBIDDEN
ITEM_NOT_FOUND
DUPLICATE_ITEM
REVIEW_NOT_DUE
STALE_REVIEW
LESSON_ITEM_NOT_ELIGIBLE
CURRICULUM_VALIDATION_FAILED
```

Expected business errors must be distinguishable from unexpected system errors.

Do not expose internal stack traces or secrets to clients.

---

# Observability

## Sentry

Sentry is used for application/server error monitoring.

Use the free tier initially.

Sentry may receive:

- Unexpected exceptions
- Failed requests
- Error codes
- Sanitized request context
- Performance diagnostics where appropriate

Sentry must not intentionally receive:

- Journal text
- Microphone recordings
- Authentication secrets
- Full sensitive user answers
- Private notes
- Unnecessary personal data

## PostHog

PostHog is used for product analytics.

Use the free tier initially.

Examples of allowed events:

```text
lesson_started
lesson_completed
review_item_completed
practice_started
practice_completed
level_unlocked
dashboard_widget_added
dashboard_widget_removed
```

Analytics should describe product behavior without sending sensitive learning content.

Do not send raw journal text, microphone recordings, private notes, or unnecessary typed answer contents.

## Structured Application Logs

Critical learning actions should produce structured logs where operationally useful.

Examples:

- Lesson completion
- Review completion
- Stage change
- Level unlock
- Curriculum publication
- Curriculum movement
- Import commit

Logs must follow the same sensitive-data restrictions.

---

# Admin Audit Log

Administrative mutations require an audit trail.

Audit events should record:

- Admin/developer actor
- Action type
- Target resource
- Resource ID
- Timestamp
- Relevant before/after metadata
- Reason when required

Examples:

```text
Moved learning item from Level 2 to Level 3
Approved duplicate candidate as homonym
Archived curriculum item
Requested progress reset after curriculum change
Imported curriculum batch
```

Audit logs should not store secrets or unnecessary sensitive user content.

---

# Data Safety

## Destructive Operations

Destructive operations require explicit confirmation.

Examples:

- Reset item
- Reset level
- Reset language
- Reset account progress
- Delete account
- Archive/delete curriculum

Large reset operations must be transactional so partial resets do not leave inconsistent state.

## Reset Account vs Delete Account

`Reset account`:

- Preserves authentication/account
- Preserves profile
- Clears applicable learning/progress state as defined by the reset flow

`Delete account`:

- Removes the user's Polyglot application data
- Removes journal entries
- Removes user-owned content as required by deletion policy
- Triggers the appropriate Clerk account deletion workflow

These are distinct operations.

## Backups

Database backups are an architectural requirement for production.

Backup/restore procedures must be tested before relying on production user learning data.

---

# Database Authority

Neon PostgreSQL is the authoritative source for persisted Polyglot learning state.

Client state, browser storage, caches, dashboard projections, analytics, and external providers must never override authoritative database state.

Database constraints should enforce important integrity rules where appropriate in addition to application-level validation.

---

# Critical Invariants

The codebase must never violate the following rules:

1. A published curriculum item has a stable permanent identity.
2. Moving or editing an item does not silently create a replacement identity.
3. Official curriculum content and user progress are stored separately.
4. User A cannot read or mutate User B's private learning data.
5. Progress for one language cannot modify another language's progress.
6. SRS state changes only through centralized SRS domain logic.
7. Frontend code never calculates authoritative SRS stages or next-review timestamps.
8. Browser time is never authoritative for review eligibility.
9. A due review cannot advance twice because of duplicate/concurrent submissions.
10. A failed completed-item review transaction leaves that item's previous SRS state unchanged.
11. Completed review items may persist even when the overall review session is abandoned.
12. A half-completed bidirectional review item cannot change SRS state.
13. Merely viewing lesson content never creates SRS progress.
14. Exiting or refreshing an unfinished lesson discards that lesson session.
15. Lesson items enter SRS only after the entire lesson comprehension quiz is completed.
16. A failed final lesson-enrollment transaction must not enroll only part of the lesson batch.
17. Supplemental practice cannot accidentally mutate core SRS state.
18. Admin curriculum edits cannot silently destroy existing user progress.
19. Archived curriculum remains referenceable by historical/current user progress.
20. CSV import commits cannot leave a partially committed accepted batch after transactional failure.
21. Deck-only/custom progress cannot advance official curriculum progress.
22. Demo state cannot modify authenticated learner progress.
23. Sandbox state cannot modify production learner progress.
24. Every server-side mutation validates authentication where required, authorization, ownership, and input.
25. Users cannot arbitrarily assign themselves SRS stages, review times, XP, levels, or unlocks.
26. Business rules belong in domain/application modules rather than being duplicated across UI/routes.
27. Neon PostgreSQL is authoritative for persisted learning state.
28. Critical unlock rules are configuration/data-driven wherever practical.
29. Future languages must not require adding Spanish-specific columns throughout unrelated core tables.
30. Meaningful language distinctions such as accents/diacritics must not be erased by duplicate normalization.
31. Permanent speech recordings are never created from speaking practice.
32. Sensitive learning content is not intentionally sent to Sentry or PostHog.
33. Admin authorization is rechecked server-side for every administrative mutation.
34. Earned curriculum unlocks remain unlocked even if earlier SRS items later fall below the unlock threshold.
35. AI features may consume approved learning context in the future but may not directly mutate official curriculum without an explicit administrative workflow.

---

# Architecture Decisions

## ADR-001 — Modular Monolith

**Decision:** Use one Next.js application and one primary PostgreSQL database with strict domain boundaries.

**Why:** This minimizes deployment complexity while preserving a clean path to future mobile clients, APIs, or extracted services.

## ADR-002 — Drizzle + Neon

**Decision:** Use Drizzle ORM with Neon PostgreSQL.

**Why:** Keep relational learning state explicit and strongly typed while retaining direct control over PostgreSQL data modeling and transactions.

## ADR-003 — Centralized Learning Domain Logic

**Decision:** SRS, curriculum gating, lessons, progress, and unlock rules must live in domain/application services.

**Why:** These rules are high-risk product logic and must have one authoritative implementation.

## ADR-004 — UTC Authoritative Time

**Decision:** Persist absolute timestamps in UTC and use server time for review eligibility.

**Why:** Prevent client-clock manipulation and make review behavior consistent across timezones.

## ADR-005 — R2 for Persistent Media

**Decision:** Store permanent learning media in Cloudflare R2 and metadata in PostgreSQL.

**Why:** Keep binary media separate from relational application data.

## ADR-006 — Ephemeral Lessons

**Decision:** Unfinished lessons are not recoverable and do not persist across refresh, navigation, or browser closure.

**Why:** The product considers lesson completion to occur only after the full comprehension quiz succeeds.

## ADR-007 — Atomic Review Item Completion

**Decision:** Persist each fully completed review item independently and transactionally.

**Why:** Users retain completed progress when abandoning a review session while half-finished items remain unchanged.

## ADR-008 — Data-Driven Unlocks

**Decision:** Level, practice, and test unlock requirements are configuration/data-driven.

**Why:** Curriculum rules must be adjustable by administrators without scattering conditions throughout the codebase.

## ADR-009 — Provider Boundaries

**Decision:** External capabilities such as speech, storage, analytics, and monitoring are accessed through provider boundaries where practical.

**Why:** Providers can change without rewriting learning-domain behavior.

## ADR-010 — No Dedicated Background Queue in v1

**Decision:** Do not introduce a background-job system until a real workload requires one.

**Why:** Reviews are timestamp-driven and current v1 workflows do not justify queue infrastructure.

---

# Parameters That Must Remain Configurable

The following values must not be silently invented or duplicated in code:

- SRS penalty factor
- Minimum SRS stage after penalties
- Review stage intervals
- Early-level accelerated SRS intervals
- Level-unlock ratio
- Level-unlock target stage
- Lesson batch-size limits
- Practice advancement thresholds
- Practice unlock levels
- Test unlock requirements
- XP awards
- Rank thresholds
- Leech thresholds
- Access-tier rules

If one of these values has not yet been explicitly defined, implementation should treat it as an unresolved product configuration rather than choosing an arbitrary value.
