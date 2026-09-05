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

> **CSV import was descoped 2026-09-05** (see `progress-tracker.md`). Official
> curriculum is authored directly through the Admin curriculum editors
> instead; there is no bulk-import workflow.

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

# Environments

Polyglot runs in three environments. Each is fully isolated: no environment may read or write another environment's data, and production credentials are never present outside production.

| Environment | Purpose | App | Database | Auth | Media |
| --- | --- | --- | --- | --- | --- |
| `development` | Local machine | `next dev` | Neon development branch, or local PostgreSQL | Clerk development instance | R2 development bucket |
| `preview` | Per-pull-request deploy | Vercel preview | Ephemeral Neon branch per pull request | Clerk development instance | R2 preview bucket |
| `production` | Live users | Vercel production | Neon production branch | Clerk production instance | R2 production bucket |

Rules:

- Preview environments are seeded from curriculum fixtures. Production user data is never copied into preview or development.
- Ephemeral Neon branches are created when a pull request opens and deleted when it closes.
- Each environment has its own Sentry environment tag and PostHog project or environment property, so preview noise never contaminates production metrics.
- Environment configuration is resolved through the typed configuration module described in `code-standards.md`. No environment branching on hostname or on `NODE_ENV` inside domain code.
- A single `APP_ENV` value identifies the environment to application code. `NODE_ENV` is not sufficient, because preview and production are both production builds.

---

# CI/CD Pipeline

Continuous integration runs on GitHub Actions. Continuous deployment runs through Vercel's Git integration, gated on required GitHub status checks.

## Pipeline Stages

Every pull request runs the following stages. Later stages do not run if an earlier stage fails.

```text
1. setup        install dependencies from the lockfile (npm ci), restore caches
2. verify       typecheck, lint, format check          (parallel)
3. test         unit and integration tests             (parallel with verify)
4. migrate      apply migrations to an ephemeral database, check for schema drift
5. build        next build
6. e2e          Playwright against the preview deployment
7. deploy       Vercel promotes only when every required check is green
```

## Workflows

| Workflow | Trigger | Responsibility |
| --- | --- | --- |
| `ci.yml` | pull request, push to `main` | typecheck, lint, unit and integration tests, build |
| `migrate.yml` | pull request touching `db/migrations/**`, and pre-production promotion | migration application, drift detection, destructive-change detection |
| `e2e.yml` | preview deployment ready | Playwright critical-path suite |
| `security.yml` | pull request, weekly schedule | dependency audit, secret scanning, static analysis |
| `preview-cleanup.yml` | pull request closed | delete the pull request's Neon branch and preview resources |

## Required Checks

`main` is protected. Merging requires:

- typecheck, lint, and format check passing
- unit and integration tests passing
- build passing
- migration check passing
- no high or critical severity dependency advisories
- at least one approving review once the project has more than one contributor

Deployment to production is impossible while any required check is failing. This is enforced by branch protection, not by convention.

## Pipeline Requirements

- Use `npm ci`, never `npm install`, in CI. The lockfile is authoritative.
- Cache the npm cache directory, the Next.js build cache, and Playwright browser binaries. Cache keys include the lockfile hash.
- Use concurrency groups keyed by branch, cancelling superseded in-progress runs.
- Upload Playwright traces, screenshots, and videos as artifacts on failure only.
- Pull request feedback should complete in under ten minutes. If the suite grows past that, shard it rather than removing coverage.
- CI must never require production credentials. Any job needing a database uses an ephemeral one.
- Workflows use minimum-scope permissions and pin third-party actions to a commit SHA.

## Deployment

- Trunk-based development. `main` is always deployable.
- Vercel builds every pull request as a preview deployment.
- Merging to `main` deploys to production once checks pass.
- Rollback is a Vercel instant rollback to the previous deployment. Database changes are never rolled back this way; see the migration strategy below.

---

# Database Migration Strategy

Migrations are the highest-risk routine operation in the system, because they are the one change that cannot be undone by redeploying the previous build.

## Authoring Rules

- All schema changes are generated Drizzle migrations, committed to the repository.
- A migration that has been merged to `main` is immutable. Corrections are made by adding a new migration.
- Migrations run as a discrete, gated pipeline step. They never run on application boot, and never inside a request handler.
- Every migration must be safe to run while the previous application version is still serving traffic. Deployments are not atomic with migrations, so both versions overlap.

## Forward-Only in Production

Production migrations are forward-only. A mistake is corrected by writing a new compensating migration, not by reversing history.

Local and preview environments may reset freely.

## Expand and Contract

Renames, type changes, and column removals use a three-phase sequence across separate deployments:

```text
1. expand    add the new column or table; write to both; read from the old
2. migrate   backfill existing rows in batches; switch reads to the new
3. contract  stop writing the old; drop it in a later, separate deployment
```

Never combine expand and contract in one deployment. The contract phase requires explicit approval, per the destructive-change rules in `ai-workflow-rules.md`.

## Operational Safety

- Index creation on populated tables uses `CREATE INDEX CONCURRENTLY`, outside a transaction.
- Migrations set a lock timeout so a blocked migration fails fast rather than queueing behind long-running queries and stalling the application.
- Data backfills are batched, resumable, and separate from the schema migration that enables them.
- Adding a `NOT NULL` column to a populated table requires a default or a backfill-then-constrain sequence.

## CI Verification

The migration workflow must:

1. Apply every migration from empty to head against an ephemeral database.
2. Detect schema drift between the Drizzle schema definition and the migration history.
3. Flag destructive statements (`DROP`, `ALTER ... TYPE`, `NOT NULL` on existing columns) for explicit human approval.
4. Apply migrations to a database seeded with fixture data, so backfills are exercised rather than only running against an empty schema.

---

# Idempotency and Exactly-Once Effects

Network retries, double-clicks, and offline resubmissions must never award progress twice. Invariants 9, 16, 20, and 25 depend on this section being implemented.

## Requirement

Every mutation that changes SRS state, awards XP, or consumes a limited resource must accept an idempotency key supplied by the client.

Applies to:

- Review item completion
- Lesson enrollment commit
- XP and points awards
- Test submission
- Journal entry creation
- Media upload finalization

## Mechanism

- The key is a client-generated UUID, unique per logical operation, reused across retries of that same operation.
- The server records the key alongside the user ID, endpoint, and a hash of the request payload, under a unique constraint.
- A replay with a matching key and matching payload returns the original stored result without re-executing the effect.
- A replay with a matching key but a different payload is rejected as a conflict. This catches key reuse bugs rather than silently accepting them.
- The key record is written in the same transaction as the effect. A key stored outside the transaction provides no guarantee.
- Keys expire after a configurable retention window.

Idempotency is a server-side guarantee. Client-side deduplication is a convenience and is never sufficient.

---

# Rate Limiting and Abuse Prevention

The product specification identifies progress farming as a real risk. Rate limiting is the enforcement mechanism and is required in v1.

## Provider Boundary

Rate limiting is accessed through a provider interface in `providers/rate-limit`, consistent with ADR-009. Domain code expresses intent — "this action, for this subject, at this cost" — and never talks to the underlying store directly.

The v1 backing store is **Upstash Redis**, implemented behind that same `providers/rate-limit` boundary (spec 08). Local development and every automated test use a credential-free in-memory implementation of the same interface instead — no test run requires Upstash credentials to exist. Rate-limit state never lives in the application's own PostgreSQL database.

## Required Limits

| Surface | Rationale |
| --- | --- |
| Authentication-adjacent routes | Credential stuffing and enumeration |
| Review submission | Progress and XP farming |
| Lesson completion | Progress farming |
| Journal writes | Storage abuse |
| Test submission | Score farming |
| Admin mutations | Blast-radius containment on a compromised session |
| Media upload | Storage and bandwidth cost |
| Support and feedback forms | Spam |
| Demo session creation | Unauthenticated resource exhaustion |

## Rules

- Limits are keyed by authenticated user ID where available, falling back to IP address for unauthenticated surfaces.
- Progress-affecting mutations fail closed. If the rate limiter is unavailable, the mutation is rejected rather than allowed through unchecked.
- Read-only surfaces may fail open.
- Exceeding a limit returns the structured `RATE_LIMITED` error with a `Retry-After` value.
- Limit values are configuration, not literals in handlers.
- Edge-level protection through the hosting platform's firewall complements application limits. It does not replace them, because it cannot reason about user identity or business meaning.

---

# Scalability and Performance

## Workload Shape

Polyglot's load is read-heavy and bursty. Dashboards and curriculum pages dominate reads. Writes arrive in concentrated bursts during review sessions, where one user may submit dozens of mutations in a few minutes.

This shape means the review-due query and the review-submit transaction are the two paths that matter. Optimize those; treat the rest as ordinary.

## Database Access

- Serverless functions must not hold long-lived connection pools. Use the Neon serverless driver for request-scoped access, and a pooled connection string only for long-running work such as migrations and imports.
- Select explicit columns. `SELECT *` is prohibited in application queries.
- N+1 query patterns are prohibited. Batch related lookups.
- Every list endpoint is paginated. Keyset (cursor) pagination is required for tables that grow without bound — review history, journal entries, audit logs, admin content lists. Offset pagination is acceptable only for small bounded sets.
- Any query filtered or sorted on a column without a supporting index requires an index in the same migration that introduces the query.

## Required Indexes

At minimum, indexes must support:

- The due-review query, filtered by user, language, and next-review timestamp.
- The level-unlock aggregate, counting items at or above a stage within a level.
- The leech window, retrieving an item's most recent review outcomes.
- Admin content search and listing.
- Foreign keys used in joins.

The due-review query runs on nearly every authenticated page load. It is the single query most worth keeping fast.

## Read Models

Dashboard forecasts, streaks, and aggregate counters may be maintained as derived read models rather than recomputed from full history on each request.

Rules for any read model:

- It is derived, never authoritative.
- It can be fully recomputed from source data by a documented procedure.
- It is updated in the same transaction as its source change, or explicitly marked as eventually consistent in the UI.
- It is never used to authorize an action or to decide review eligibility.

## Performance Budgets

| Metric | Target |
| --- | --- |
| Review submission, server p95 | under 300 ms |
| Due-review query, p95 | under 100 ms |
| Dashboard load, server p95 | under 500 ms |
| Largest Contentful Paint, p75 | under 2.5 s |
| Interaction to Next Paint, p75 | under 200 ms |
| Database queries per request | under 10 |

Budgets are targets, not gates, until measurement exists. Once measurement exists, a regression past budget is a defect.

## Scaling Triggers

Do not build for scale that has not arrived. Introduce the following only when the corresponding trigger fires:

| Trigger | Response |
| --- | --- |
| A workload exceeds request-handler time limits | Introduce a background queue boundary (ADR-010) |
| Read load saturates the primary database | Add a read replica for analytics and dashboard reads |
| Cache invalidation becomes cross-instance | Introduce a shared cache tier |
| A second client, such as mobile, ships | Formalize the versioned public API surface |
| One domain's scaling profile diverges sharply | Extract that domain, per ADR-001 |

---

# Availability and Service Levels

## Health Endpoints

- `/api/health` — liveness. Returns success if the process is serving. No dependency checks. Used by uptime monitoring.
- `/api/health/ready` — readiness. Verifies database connectivity and critical provider configuration. Used by deployment verification.

Health endpoints must not require authentication, must not expose version details, connection strings, or dependency internals, and must be rate limited.

## Service Level Objectives

Beta targets:

| Objective | Target |
| --- | --- |
| Application availability | 99.5% monthly |
| Review submission success rate | 99.9% of well-formed submissions |
| Unhandled error rate | under 0.1% of requests |

These are commitments to the user's learning progress, not vanity metrics. A failed review submission that silently loses progress is the most damaging failure mode in the product.

## Graceful Degradation

Dependency failures must degrade rather than cascade:

| Dependency | Behavior when unavailable |
| --- | --- |
| PostHog | Analytics silently dropped; application unaffected |
| Sentry | Errors logged locally; application unaffected |
| R2 | Audio unavailable with a clear message; text learning continues |
| Speech provider | Speaking practice unavailable; other practice continues |
| Neon | Application is unavailable; fail loudly rather than serving stale or fabricated progress |

Analytics and monitoring outages must never break a learning session.

---

# Disaster Recovery

## Objectives

| Metric | Beta | Production |
| --- | --- | --- |
| Recovery Point Objective | 24 hours | 1 hour |
| Recovery Time Objective | 8 hours | 4 hours |

## Coverage

- Database recovery uses Neon's automated backups in beta and point-in-time recovery in production.
- **Database backups do not cover R2.** Object storage requires its own versioning and a scheduled mirror to a separate bucket or account. This is the most commonly missed piece of a backup strategy and must be implemented before production launch.
- A restore is not a backup until it has been tested. Perform a documented restore drill into a scratch environment on a defined cadence, and record the result.

## Runbook Requirements

A written recovery runbook must exist before production launch, covering: how to restore the database to a point in time, how to restore media, how to verify integrity after restore, and who is notified.

---

# Release Management

- Trunk-based development with short-lived branches.
- Conventional commit messages, so history is machine-readable and changelog generation is possible later.
- Risky domain changes ship behind a feature flag, evaluated server-side. Flags are short-lived and removed once a change is proven; a permanent flag is a configuration value and belongs in configuration.
- Rollback for application code is an instant redeploy of the previous build. Rollback for schema is a new forward migration.
- Incidents affecting learning progress or authentication take priority over feature work.

---

# Supply Chain and Platform Security

Extends the existing validation, authorization, and error-model sections.

- The lockfile is committed and authoritative. CI installs with `npm ci`.
- Automated dependency update pull requests run on a weekly schedule, reviewed rather than auto-merged.
- CI fails on high or critical severity advisories.
- Secret scanning and static analysis run on every pull request.
- Response security headers are set, including a Content Security Policy, HSTS, `X-Content-Type-Options`, and a restrictive `Referrer-Policy`.
- Inbound webhooks verify their signature before any processing. An unverified webhook is an unauthenticated request from the public internet.
- Route handlers using cookie-based authentication require CSRF protection. Server Actions carry framework-level protection and do not.
- CI verifies that no server-only secret is exposed through a `NEXT_PUBLIC_` variable.
- Third-party GitHub Actions are pinned to a commit SHA, not a mutable tag.

---

# Cost Posture

The stack is chosen to run on free tiers during beta. Cost is a design constraint, not an afterthought.

- Track usage against free-tier ceilings for the database, hosting, authentication, and object storage.
- Define an upgrade trigger for each, so a limit is reached deliberately rather than discovered through an outage.
- Media is the most likely first cost driver. Audio assets must be compressed appropriately and served with long cache lifetimes.
- Preview environments are ephemeral specifically to avoid accumulating idle paid resources.

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
20. ~~CSV import commits cannot leave a partially committed accepted batch after transactional failure.~~ Removed 2026-09-05 — CSV import was descoped; numbering kept stable rather than renumbering every invariant below it.
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
36. A progress-affecting mutation replayed with the same idempotency key produces its effect exactly once.
37. Migrations never run at application boot or inside a request handler.
38. A migration merged to `main` is immutable; corrections are new migrations.
39. Every deployed migration is safe against the previously deployed application version.
40. Production credentials, data, and secrets never exist in development or preview environments.
41. Production deployment is impossible while a required CI check is failing.
42. Progress-affecting mutations fail closed when the rate limiter is unavailable.
43. Derived read models are never authoritative and never used to authorize an action or decide review eligibility.
44. Analytics or monitoring provider failure never breaks a learning session.
45. Database backups do not cover object storage; media has its own independent backup path.
46. A backup is not considered valid until a restore has been tested and recorded.
47. Health endpoints expose no version, dependency, or configuration detail.
48. Inbound webhooks verify their signature before any processing occurs.

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

## ADR-011 — GitHub Actions for CI, Vercel for CD

**Decision:** Continuous integration runs in GitHub Actions. Deployment runs through Vercel's Git integration, gated on required GitHub status checks.

**Why:** Keeps the gate that decides whether code is safe in the same place as the code and its review, while leaving build and deploy to the platform already hosting the application.

## ADR-012 — Ephemeral Preview Databases

**Decision:** Each pull request gets its own database branch, created on open and deleted on close, seeded from curriculum fixtures.

**Why:** Migrations and destructive changes must be exercised against a real database before reaching production, without any pathway from production data into a preview environment.

## ADR-013 — Forward-Only Production Migrations

**Decision:** Production schema changes are never reversed. Mistakes are corrected by a new compensating migration, and renames or removals use expand-and-contract across separate deployments.

**Why:** Down-migrations are rarely tested and frequently destructive. Requiring a forward fix keeps the recovery path the same one exercised on every normal deploy.

## ADR-014 — Server-Enforced Idempotency

**Decision:** Every progress-affecting mutation accepts a client-supplied idempotency key, recorded transactionally with its effect.

**Why:** Retries and duplicate submissions are normal on mobile networks. Exactly-once progress is a product guarantee and cannot be delegated to the client.

## ADR-015 — Rate Limiting Behind a Provider Interface

**Decision:** Rate limiting is required in v1 and is accessed through a provider boundary, with the concrete store treated as a replaceable implementation detail.

**Why:** Progress farming is an identified product risk, and the appropriate store changes with scale. Domain code should not need to know which one is in use.

## ADR-016 — Budgets Over Speculative Optimization

**Decision:** Define explicit performance budgets and named scaling triggers rather than building for anticipated scale.

**Why:** The workload is known to be read-heavy with bursty writes. Two paths matter, and the rest should stay simple until measurement says otherwise.

## ADR-017 — Stateless Signed Lesson Sessions

**Decision:** Unfinished lesson state is carried through a server-signed
ephemeral lesson-state token rather than persisted in a lesson-session
database table.

Each authoritative lesson interaction validates the token and returns an
updated signed state. Quiz answers are evaluated server-side. Final SRS
enrollment requires a valid completed lesson state plus fresh server-side
eligibility and curriculum revalidation.

**Why:** This preserves Polyglot's intentional ephemeral-lesson model while
preventing the client from falsely claiming that a comprehension quiz was
completed. It avoids persistent unfinished-session infrastructure while
keeping lesson completion authoritative and verifiable.

**Relationship to existing decisions:** Implements ADR-006's ephemeral-lesson
model. Depends on ADR-014 for exactly-once enrollment and ADR-015 for the
rate-limit boundary. The token is an integrity mechanism only; the database
remains authoritative per the database-authority rule.

---

## ADR-018 — Progress Rows Exist Only After Enrollment

**Decision:** `user_item_progress` has no row for a learning item until the
learner actually enrolls in it. There is no "unlocked but not learned"
progress row with a null SRS stage — `srs_stage` is `NOT NULL`. Whether an
item is merely unlocked (available to appear in a lesson) is tracked
entirely separately, in `user_level_progress`, which is level-scoped, not
item-scoped.

**Why:** Blurring "unlocked" and "learned" into one nullable-stage row on
every curriculum item a user could ever see would require a row per
user-per-item at unlock time, most of which would never be touched, and
would make "has this item been learned" ambiguous between "no row" and "row
with a null stage." Two separate, narrower tables keep each one's rows
meaningful: a `user_item_progress` row always means "this learner has
studied this item at least once," and a `user_level_progress` row always
means "this level is available to this learner," independent of how much of
it they've actually done.

**Relationship to existing decisions:** Implements ADR-008's data-driven
unlocks — the unlock state this establishes is exactly what that decision's
threshold logic reads.

---

## ADR-019 — Denormalized `language_id` on `user_item_progress`

**Decision:** `user_item_progress.language_id` duplicates data already
reachable through `learning_items.language_id`. A composite foreign key on
`(learning_item_id, language_id)` referencing `learning_items(id,
language_id)` makes a progress row whose `language_id` disagrees with its
own learning item's structurally impossible — the denormalization can never
silently drift from the truth.

**Why:** The due-review query — every item due for review, for one user, in
one language — is the single most frequent progress read and needs a
composite index on `(user_id, language_id, next_review_at)`. An index can't
span a join, so without this column the query would need to join through
`learning_items` on every review-queue load. Trading one duplicated column,
made safe by a composite foreign key, for an indexable hot-path query is a
better tradeoff than joining on every read.

**Relationship to existing decisions:** Depends on ADR-002's choice of
Postgres, whose composite foreign keys make this safe; a database without
them would make this denormalization a real correctness risk instead of a
constrained one.

---

## ADR-020 — Developer Sandbox Isolated at the User Boundary

**Decision:** The admin/developer sandbox is not a flag on progress rows. It
is a normal user row (`users.is_sandbox`, `users.sandbox_owner_user_id`,
`clerk_user_id` left null) owned by a real developer account, enforced by a
check constraint requiring the owner column exactly when the flag is set.
Every progress, note, synonym, and unlock row already hangs off `user_id`,
so a sandbox user inherits complete isolation from constraints that already
exist — no progress table needed a schema change.

**Why:** The alternative — a per-row `is_sandbox` flag on every progress
table — means every query everywhere must remember to filter it, and one
forgotten filter corrupts real learner data or leaks it into an aggregate. A
separate PostgreSQL schema for sandbox data would duplicate the entire
migration history. Routing sandbox state through an ordinary, isolated user
row costs two columns and one constraint instead.

**Relationship to existing decisions:** Composes with ADR-002's Postgres
foreign-key/constraint machinery the same way ADR-019 does. Normal learner
queries, aggregates, and dashboard data must still explicitly exclude users
where `is_sandbox` is true — this decision makes that the only place
isolation needs enforcing, not a guarantee that no code will ever forget to.

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
- Rate limit thresholds and windows per surface
- Idempotency key retention window
- Cache time-to-live values per cache tag
- Performance budget thresholds
- Free-tier usage alert thresholds

If one of these values has not yet been explicitly defined, implementation should treat it as an unresolved product configuration rather than choosing an arbitrary value.
