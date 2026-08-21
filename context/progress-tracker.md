# Progress Tracker

Update this file after every meaningful implementation change.

This file is the primary handoff document between development sessions. It must contain enough current-state information that a fresh Claude session can resume work without relying on previous chat history.

---

## Current Phase

- **Foundation / specification complete — implementation audit next**

The core Polyglot context documentation has been defined:

- `project-overview.md`
- `architecture.md`
- `code-standards.md`
- `ui-context.md`
- `ai-workflow-rules.md`
- `progress-tracker.md`

The existing repository has **not yet been formally audited against these specifications**, so implementation status should not be assumed from existing files or UI screenshots.

---

## Current Goal

- Audit the existing Polyglot repository against the six context files.
- Identify what already matches the specification, what conflicts with it, and what foundational work must be completed before feature development continues.
- Choose the first small implementation unit after the audit.

---

## Completed

### Product Specification

- Defined Polyglot as a multi-language learning platform with a structured curriculum, SRS-based vocabulary and grammar learning, and unlocked practice modes.
- Defined Latin American Spanish focused on Mexican usage as the first production curriculum.
- Defined the universal level structure:
  - 48 vocabulary items
  - 4 vocabulary groups of 12
  - 12 grammar points
  - optional intermissions
- Defined strict sequential level progression.
- Defined approximately 5/6 of level-gating SRS items at Familiar 1+ as the default next-level unlock requirement.
- Defined permanent earned level unlocks.
- Defined core lesson behavior and comprehension quiz flow.
- Defined scheduled SRS review behavior and stage progression.
- Defined separate skill progression for speaking, listening, reading, sentence practice, and other practice types.
- Defined tests, dashboard behavior, demo mode, admin features, gamification, and v1 scope.

### Architecture

- Selected a **modular monolith** architecture.
- Selected Next.js App Router + TypeScript.
- Selected npm.
- Selected Tailwind CSS + shadcn/ui.
- Selected Clerk for authentication.
- Selected Neon PostgreSQL as authoritative persistent storage.
- Selected Drizzle ORM.
- Selected Vercel hosting.
- Selected Cloudflare R2 for persistent media.
- Selected Web Speech API behind a provider abstraction for v1 speaking recognition.
- Selected Sentry for error monitoring.
- Selected PostHog for product analytics.
- Defined strict domain boundaries for auth, users, languages, curriculum, lessons, SRS, progress, practice, tests, journal, decks, dashboard, gamification, admin, media, and analytics.
- Defined official curriculum data and user progress as separate data models.
- Defined stable permanent learning-item identities.
- Defined server time + UTC as authoritative for SRS scheduling.
- Defined IANA user timezones for display/calendar behavior.
- Defined completed review item as the atomic review transaction boundary.
- Defined unfinished lessons as ephemeral and non-persistent.
- Defined data-driven/configurable unlock rules.
- Defined custom-deck progress as isolated from official curriculum progress.
- Defined demo and admin-sandbox data isolation.
- Defined access tiers before Stripe integration.
- Defined 35 critical architecture invariants.

### Code Standards

- Defined strict TypeScript rules.
- Defined Server Components as the default.
- Defined thin pages, Server Actions, and route handlers.
- Defined domain/application services as owners of business logic.
- Defined repository/data-access boundaries for Drizzle.
- Defined Zod runtime validation.
- Defined structured application/domain errors.
- Defined deterministic SRS logic with explicit authoritative `now` values.
- Defined Vitest for unit/integration tests.
- Defined Playwright for critical end-to-end flows.
- Defined ESLint + Prettier requirements.
- Defined environment-variable validation and secret-handling rules.
- Defined accessibility, animation, caching, storage, API, and dependency standards.

### UI Specification

- Preserved the existing cozy Polyglot notebook/grid-paper visual identity.
- Defined light, dark, and system theme support.
- Defined green as the primary brand/action color.
- Defined vocabulary as blue and grammar as red when learning-type color is needed.
- Defined light-to-dark green SRS progression colors.
- Preserved the existing handwritten Polyglot font as the primary visual voice.
- Defined desktop top navigation and mobile bottom navigation.
- Defined variable-width dashboard widgets.
- Defined dashboard widget reordering.
- Defined focused lesson and review layouts.
- Defined the detailed learning-item page structure.
- Defined Bunpro-inspired review interactions with Enter-key flow and Spanish accent helpers.
- Defined educational incorrect-answer feedback.
- Defined animated level-up celebrations.
- Preserved the multilingual handwriting animation concept on the landing page.
- Defined responsive/tablet preparation for future writing and Apple Pencil features.

### AI Development Workflow

- Defined the required startup reading order for all six context files.
- Defined short planning before non-trivial implementation work.
- Defined one verifiable feature unit at a time.
- Defined context files as authoritative over conflicting implementation code.
- Defined handling of missing requirements and unrelated bugs.
- Defined additive migration autonomy and destructive-change approval requirements.
- Allowed justified dependency installation.
- Disabled automatic Git commit/push behavior.
- Defined same-task documentation synchronization.
- Defined required verification using type checks, linting, relevant tests, and `npm run build` when applicable.
- Defined failure reporting and pre-existing-failure distinction.

---

## In Progress

- None yet.

No implementation unit should be marked in progress until the existing repository has been audited against the new source-of-truth documentation.

---

## Next Up

### 1. Repository Audit

Inspect the current Polyglot codebase and document:

- Current Next.js/App Router structure
- Current dependencies
- Current authentication implementation
- Current database/ORM implementation
- Current file/folder organization
- Current dashboard implementation
- Current landing-page implementation
- Existing lesson/review code, if any
- Existing curriculum/data model, if any
- Existing theme/font/token implementation
- Existing tests and build status
- Any code that conflicts with `architecture.md` or `code-standards.md`

Do not rewrite the entire project during the audit.

### 2. Foundation Gap List

After the audit, classify findings as:

- **Already compliant**
- **Needs small refactor**
- **Needs foundational implementation**
- **Blocked by unresolved requirement**
- **Future scope**

### 3. Choose First Implementation Unit

Choose the smallest foundational unit that enables later development without violating architecture.

Likely candidates may include, depending on the audit:

- establish Drizzle + Neon schema foundation
- establish domain folder boundaries
- establish typed environment configuration
- establish theme tokens from `ui-context.md`
- establish Clerk → internal-user synchronization
- establish language records / active-language context

Do not choose one until the repository audit confirms what is actually missing.

---

## Open Questions

### Product / SRS Configuration Still To Define

These values are intentionally configurable and should not be invented during implementation:

- Exact SRS penalty factor
- Minimum SRS stage after incorrect-answer penalties
- Exact leech detection thresholds
- Exact XP awards by activity
- Rank thresholds
- Exact practice-stage advancement thresholds by practice type
- Exact test unlock configuration beyond already stated examples
- Exact practice unlock levels/content rules
- Lesson batch-size minimum and maximum bounds

### Technical / Implementation Questions To Resolve During Audit

- What parts of the current repository already implement the target architecture?
- Is the existing handwritten font locally configured, package-based, or externally loaded?
- What theme/token system currently exists?
- What database schema, if any, currently exists?
- Is Clerk already integrated?
- Is the existing dashboard using reusable widgets or page-local components?
- Are any current UI implementations tightly coupled to placeholder/mock data?
- Are there existing migrations that must be preserved?
- What test tooling is already installed/configured?

Do not answer these by assumption; inspect the repository first.

---

## Architecture Decisions

### ADR-001 — Modular Monolith

Use one Next.js application and one primary PostgreSQL database with strict domain boundaries.

### ADR-002 — Drizzle + Neon

Use Drizzle ORM with Neon PostgreSQL.

### ADR-003 — Centralized Learning Logic

SRS, curriculum gating, lessons, progress, and unlock rules live in centralized domain/application services.

### ADR-004 — UTC Authoritative Time

Store absolute timestamps in UTC and use server time for authoritative review eligibility.

### ADR-005 — User Timezones

Store an IANA timezone per user for display, streak/day boundaries, calendar behavior, and future reminders.

### ADR-006 — R2 Media Storage

Use Cloudflare R2 for persistent learning media. Keep media binaries out of PostgreSQL.

### ADR-007 — Ephemeral Lessons

Unfinished lessons are not persisted. Refreshing, exiting, or navigating away discards the unfinished lesson.

### ADR-008 — Atomic Review Items

Each fully completed review item commits transactionally. Half-completed bidirectional items do not alter SRS state.

### ADR-009 — Permanent Unlocks

A legitimately earned curriculum level remains unlocked even if earlier SRS items later fall below the unlock threshold.

### ADR-010 — Data-Driven Unlock Rules

Level, practice, test, and access rules should be configuration/data-driven rather than scattered hardcoded conditions.

### ADR-011 — Stable Curriculum Identity

Official learning items retain stable permanent IDs when moved or edited. Existing user progress stays linked unless an admin explicitly requests a reset.

### ADR-012 — Curriculum / Progress Separation

Official learning content and user-specific learning state are stored separately.

### ADR-013 — Separate Skill Progression

Speaking, listening, reading, sentence practice, and similar skills use separate progression from core vocabulary/grammar SRS.

### ADR-014 — Provider Boundaries

Storage, speech recognition, monitoring, and analytics use provider/adaptor boundaries where practical.

### ADR-015 — No Background Queue in v1

Do not introduce a dedicated background-job system until a concrete workload requires it.

### ADR-016 — Access Tier Preparation

Model free/premium curriculum access before Stripe exists. Until billing is implemented, currently available curriculum may remain accessible.

### ADR-017 — Database Role Authority

The Polyglot database is authoritative for roles/permissions. Clerk metadata may mirror them for convenience.

### ADR-018 — Demo / Sandbox Isolation

Demo and admin sandbox progress must never modify real authenticated learner progress.

---

## Known High-Risk Areas

Treat these as regression-sensitive areas during implementation:

- SRS stage calculations
- Review due-time calculations
- Concurrent review submissions
- Half-completed bidirectional review handling
- Level unlock calculations
- Permanent unlock persistence
- Lesson-batch SRS enrollment
- Progress preservation
- Language-to-language progress isolation
- Dashboard counts/forecast accuracy
- Admin curriculum moves/edits
- Curriculum item identity preservation
- CSV duplicate detection/import transactions
- Reset workflows
- Authorization for admin/developer operations

Changes affecting these areas should receive focused tests.

---

## Session Notes

### Documentation Baseline

The six context files now define the intended source of truth for future development.

A fresh development session should read them in this order:

1. `project-overview.md`
2. `architecture.md`
3. `code-standards.md`
4. `ui-context.md`
5. `ai-workflow-rules.md`
6. `progress-tracker.md`

### Existing UI

Reference screenshots show an existing Polyglot landing page and dashboard with the desired cozy notebook/grid aesthetic.

Do **not** assume the implementation behind those screenshots complies with the newly defined architecture or code standards until it has been audited.

### Immediate Resume Instruction

If resuming from this tracker, the next task is:

> **Audit the current Polyglot repository against the six context files. Do not begin broad feature implementation yet. Report compliant areas, conflicts, missing foundations, and recommend the first small implementation unit.**

---

## Last Updated

- 2026-08-20
- Context/specification phase completed.
- Repository audit is the next required development step.
