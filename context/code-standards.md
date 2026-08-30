# Code Standards

## General

- Keep modules small, focused, and single-purpose.
- Fix root causes instead of layering workarounds, duplicate logic, or temporary patches.
- Do not mix unrelated concerns in the same component, route, service, or implementation change.
- Prefer readability and maintainability over cleverness or unnecessary brevity.
- Remove dead code, obsolete helpers, commented-out implementations, and unused imports.
- Avoid speculative abstractions for features that do not exist yet.
- Reuse existing project abstractions before introducing new ones.
- Refactor an awkward abstraction when the refactor is clearly within the current scope. If it would substantially expand scope, record the issue in `progress-tracker.md` instead of adding another workaround.
- Business rules defined by `architecture.md` take precedence over conflicting implementation patterns.
- Do not silently invent missing product behavior. Add unresolved decisions to `progress-tracker.md`.

## TypeScript

- TypeScript strict mode is required throughout the project.
- Avoid `any`. Use it only for rare interoperability cases that cannot be typed safely, and document why.
- Treat unknown external input as `unknown` until it has been validated or narrowed.
- Validate untrusted data at runtime with Zod.
- Minimize non-null assertions (`value!`) and type assertions (`value as SomeType`).
- Prefer `type` for most application types; use interfaces only when extensibility or declaration merging is useful.
- Prefer string literal unions or `as const` values over TypeScript `enum` for domain values.
- Exported domain/application functions should have explicit return types.
- Small local helpers may rely on type inference when the result is obvious.
- Do not expose raw database row types as the public domain API when a domain type or view model is more appropriate.

## Naming

- Files and folders: `kebab-case`
- React components and types: `PascalCase`
- Functions and variables: `camelCase`
- True global constants: `UPPER_SNAKE_CASE`
- PostgreSQL tables and columns: `snake_case`
- TypeScript properties: `camelCase`
- Analytics/log event names: `snake_case`

Boolean names should read clearly, such as:

```text
isPublished
hasAccess
canReview
shouldUnlock
```

Avoid vague names such as `thing`, `stuff`, `temp`, `handler2`, or `data2` when a meaningful domain name exists.

## Functions and Modules

- Functions should have one clear responsibility.
- Split functions that combine validation, authorization, domain logic, persistence, and formatting.
- Prefer pure functions for deterministic calculations such as SRS stages, unlock thresholds, answer similarity, and XP.
- Keep side effects at explicit application, repository, or provider boundaries.
- Domain logic must not depend on React, Next.js request objects, Clerk APIs, or browser APIs.
- Avoid circular dependencies.
- Cross-domain imports should use the domain's public API where practical.
- Do not reach into another domain's private/internal helpers.

Prefer:

```ts
import { calculateNextReview } from "@/domains/srs";
```

rather than arbitrary deep imports into another domain's implementation.

## Next.js

### App Router

Use the Next.js App Router.

### Server Components

- Default to Server Components.
- Add `"use client"` only when browser-side interactivity, state, effects, or browser APIs require it.
- Keep client components as low in the component tree as practical.
- Do not turn an entire page into a client component because one nested control needs interactivity.

### Data Fetching

- Prefer server-side data fetching when practical.
- Use client-side fetching for genuinely interactive or frequently updating data.
- Persisted database state remains authoritative.

### Pages, Server Actions, and Route Handlers

- Keep pages/layouts thin and focused on composition.
- Keep Server Actions thin and delegate to application/domain services.
- Keep route handlers thin and delegate to the same application/domain services.
- Do not implement SRS, curriculum, unlock, lesson, or progress rules directly in pages/actions/routes.
- Do not call Drizzle directly from routes/actions when a domain service or repository should own the operation.
- Version reusable API endpoints under `/api/v1/*`.
- Keep middleware limited to broad request-level concerns, not learning-domain logic.

## React Components

- Keep components focused on one UI responsibility.
- Compose large pages from smaller components.
- Component props must be typed.
- Presentation components should not know raw database row shapes when a view model is clearer.
- Components must not directly access Drizzle or Neon.
- Components must not directly mutate authoritative SRS or progress state.

Use:

```text
components/ui/
```

for shadcn/ui base/generated components, and:

```text
components/shared/
```

for reusable application-level UI.

Prefer wrapping or composing shadcn components instead of modifying generated primitives directly. Only modify `components/ui/*` when the customization genuinely belongs in the base component.

There is no hard line-count limit, but components that clearly mix several concerns should be split.

## State Management

- Use React `useState` and `useReducer` for ordinary local UI state.
- Do not introduce Redux, Zustand, or another global state library until there is a demonstrated need.
- Server/database state remains authoritative.
- Do not duplicate large amounts of server state into global client state unnecessarily.
- Use URL/search parameters for navigable/shareable state when appropriate.
- `localStorage` and `sessionStorage` may store non-authoritative UI convenience state only.
- Never use browser storage as the sole source of authoritative SRS stages, review eligibility, unlocks, XP, or learning progress.

## Forms and Validation

- Simple forms may use native forms and Server Actions.
- Complex client forms may use React Hook Form.
- Use Zod for runtime schema validation.
- Reuse validation schemas between client and server where practical.
- The server must always validate again even if the client already validated.
- Show field-specific validation messages when appropriate.
- Keep business-rule errors separate from input-shape validation.

## Error Handling

Use structured application/domain errors for expected failures.

Example error codes:

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

- Do not throw arbitrary user-facing strings throughout the codebase.
- Unexpected errors should be reported to Sentry.
- Users receive safe, understandable messages; internal details remain server-side.
- Do not swallow important errors or return fake success states.
- Never hide SRS, database, auth, or authorization failures just to keep the UI looking successful.
- Use error boundaries where one non-critical widget/section should not crash the entire page.
- Use inline feedback or toasts for important user operations.

## Domain Logic

The following behavior must have one authoritative implementation:

- SRS stage transitions
- SRS penalties
- Review timing
- Review eligibility
- Lesson eligibility
- Lesson priority
- Level unlocks
- Practice unlocks
- Test unlocks
- XP
- Rank
- Streaks
- Duplicate detection
- Access-tier rules

Do not duplicate these calculations in pages, components, hooks, actions, or route handlers.

## SRS Standards

SRS is high-risk product logic and has stricter rules.

- SRS calculations should be deterministic and pure wherever possible.
- Read SRS values from centralized configuration.
- Do not scatter interval or penalty constants throughout the codebase.
- Time-dependent SRS functions should receive an explicit authoritative `now` value.
- Do not repeatedly call `new Date()` inside low-level SRS calculations.
- Use explicit stage identifiers rather than relying on hidden numeric indexes across the application.
- Never trust SRS stage, next-review time, or unlock state sent from the client.
- Reload and validate authoritative progress before applying review mutations.
- Only the SRS domain may authoritatively assign SRS stage, next-review time, Fluent/completion time, or review-derived progress fields.
- A completed review item is the transaction boundary.
- Half-completed bidirectional review items do not alter SRS state.
- Concurrent/stale review submissions must not advance the same due review twice.
- SRS calculations require focused unit tests using fixed timestamps.

Preferred style:

```ts
calculateNextReview({
  stage,
  now,
  config,
});
```

## Lesson Standards

- Lesson eligibility must be calculated server-side.
- Client-provided lesson item IDs are requests, not proof of eligibility.
- Revalidate lesson items at final completion.
- Viewing lesson content does not create SRS progress.
- Unfinished lessons are ephemeral.
- Do not create persistence/session tables for unfinished lessons unless the product requirement changes.
- Refreshing, navigating away, or exiting an unfinished lesson discards it.
- The full lesson comprehension quiz must complete before the batch enters SRS.
- Final SRS enrollment for the lesson batch is all-or-nothing.
- Do not partially enroll a failed lesson-completion batch.

## Practice Standards

- Practice progress and core SRS progress are separate.
- Speaking, listening, reading, sentence practice, and similar activities may read SRS/curriculum state.
- They must not directly mutate core SRS state.
- Skill progression rules live in the practice domain.
- Skill thresholds are configuration-driven by practice type.
- Free study must never accidentally advance official SRS progress.

## Database Access

- React components never call Drizzle directly.
- Next.js pages/routes/actions should not contain ad hoc database logic when a repository/application service owns the operation.
- Repository/data-access modules are the normal boundary for Drizzle queries.
- Domain calculations should not depend directly on database implementation details.
- Use transactions for multi-step consistency-sensitive mutations.

Transactions are required where applicable for:

- Completed review items
- Final lesson-batch SRS enrollment
- Account/level/language resets
- Accepted CSV import commits
- Other multi-write operations that must succeed or fail together

### Queries

- Avoid unnecessary over-fetching.
- Avoid N+1 query patterns when they materially affect performance.
- Use joins/batched queries where appropriate.
- Raw SQL is allowed when Drizzle cannot express something cleanly or efficiently.
- Raw SQL must be parameterized and isolated in data-access code.
- Never interpolate untrusted input into SQL strings.

### Database Constraints

Use PostgreSQL constraints to backstop important integrity rules where practical:

- Primary keys
- Foreign keys
- Unique constraints
- Non-null constraints
- Check constraints

Application validation and database constraints should complement each other.

## Drizzle Schema and Migrations

- All schema changes go through migrations.
- Migration files are committed to Git.
- Do not manually modify production schema as a substitute for a migration.
- Once migrations are applied to shared/production environments, treat them as append-only.
- Create a new migration for subsequent changes.
- Destructive schema changes require deliberate review.
- Seed data is separate from schema migrations.
- Official curriculum imports/seeding are separate from schema migrations.
- Schema terminology should reflect Polyglot domain language.

## Authentication and Authorization

- Resolve authenticated Clerk identity server-side for protected operations.
- Map Clerk identity to the internal Polyglot user record.
- Verify authorization, role, and ownership before mutation.
- Hiding UI is never authorization.
- Every admin/developer mutation rechecks permissions server-side.
- Centralize reusable authorization helpers.
- Avoid exposing Clerk IDs publicly when an internal/public-safe identifier can be used instead.
- Users cannot arbitrarily mutate their own progress, XP, SRS stages, review times, levels, or unlocks.

## API Routes

Reusable API contracts live under `/api/v1/*`.

Success response:

```json
{
  "data": {}
}
```

Error response:

```json
{
  "error": {
    "code": "REVIEW_NOT_DUE",
    "message": "This review is not available yet."
  }
}
```

API endpoints should normally process concerns in this order:

1. Parse and validate input
2. Authenticate
3. Authorize / verify ownership
4. Verify business conditions
5. Execute application/domain operation
6. Map the result into a response DTO

Use meaningful HTTP status codes.

Do not return raw database rows when a safe response model is more appropriate.

Omit internal-only data such as Clerk IDs, audit internals, provider secrets, and internal flags unless specifically required.

## Time and Dates

- Persist timestamps in UTC.
- Use server time for authoritative learning decisions.
- Use the user's IANA timezone for display and calendar/day-boundary behavior.
- Do not use the browser clock to decide whether a review is due.
- Centralize reusable date/time helpers under `lib/time/`.
- Use native `Date` for simple timestamp work.
- Use `date-fns`/timezone helpers when non-trivial timezone or calendar behavior requires them.
- Avoid scattering timezone-conversion code across UI components.

## Data and Storage

### Neon PostgreSQL

Use Neon for structured application data such as:

- Users
- Profiles/settings
- Curriculum
- Relationships
- Progress
- SRS state
- Tests
- Journals
- Deck metadata/content
- Media references
- Admin/audit information

### Cloudflare R2

Use R2 for persistent binary media such as:

- Pronunciation audio
- Images
- Future learning media

Do not store large binary media directly in PostgreSQL.

PostgreSQL stores R2 metadata and object references.

### Upload Rules

Validate uploads for MIME type, file size, and allowed format where relevant.

Do not trust user-provided filenames as storage keys. Generate controlled object keys/IDs.

R2 access must go through the storage provider layer rather than scattered SDK calls.

### Speaking Audio

Speaking-practice microphone recordings are temporary and must never be persisted to permanent R2 storage.

## Speech Recognition

- Access browser speech recognition through the speech-provider interface.
- Do not couple practice components directly to Web Speech API response structures.
- Normalize provider output into Polyglot's internal contract.
- v1 provider output includes transcription and pass/fail.
- Expected-answer similarity is calculated internally.
- Unsupported browsers must fail gracefully with clear UI messaging.
- Future speech providers must be replaceable without rewriting speaking-domain rules.

## Caching

- Shared curriculum/static read data may be cached.
- Admin curriculum edits must invalidate affected caches.
- Do not use stale cached values for authoritative learning-state decisions.
- Never use stale cache state to determine review eligibility, current SRS stage, lesson eligibility, unlock mutations, or access authorization.
- Neon remains authoritative for persisted learner state.

## Background Work

There is no dedicated background queue/job system in v1.

- Do not introduce one without a concrete workload that requires it.
- Normal review scheduling uses timestamps and does not require cron/background processing.
- If long-running workloads later appear, isolate them behind a background-processing boundary.
- Do not place long-running background work inside ordinary request handlers.

Potential future background workloads include large CSV imports, bulk audio processing, AI processing, reminders, and analytics aggregation.

## Styling

- Tailwind CSS is the primary styling method.
- Use CSS variables/tokens for theme values.
- Do not hardcode theme hex values in application components.
- Follow the design tokens and radius rules defined in `ui-context.md`.
- Avoid inline `style={{ ... }}` unless a value is genuinely dynamic.
- Use `cn()` for conditional class composition.
- Use CVA (`class-variance-authority`) for reusable component variants where appropriate.
- Avoid repeated complex Tailwind class combinations; extract reusable components/variants where they represent the same design concept.
- Avoid arbitrary values such as `w-[437px]` unless the design truly requires them.
- Use mobile-first responsive behavior.

## Accessibility

Accessibility is required.

- Prefer semantic HTML.
- Interactive controls must be keyboard accessible.
- Use `<button>` for actions.
- Use `<Link>`/`<a>` for navigation.
- Do not build interactions around clickable `<div>` elements.
- Form controls require accessible labels.
- Images require meaningful alt text unless decorative.
- Preserve visible focus states.
- Respect reduced-motion preferences.
- Prefer accessible Radix/shadcn primitives for dialogs, menus, popovers, tabs, and related components.

## Animation

- Use CSS/Tailwind transitions for simple interaction states.
- Use Motion for complex entrance, layout, or interaction animations.
- Animation is presentation only.
- Animation must not control business logic.
- Do not wait for an animation to finish before authoritatively saving progress.
- Animations must not block core learning actions.
- Respect `prefers-reduced-motion`.

## Analytics and Logging

### PostHog

Centralize analytics event names/constants.

Do not send journal text, microphone recordings, private notes, authentication secrets, raw sensitive answer content, or unnecessary personal information.

### Sentry

Unexpected errors should be captured through the monitoring adapter/provider.

Do not intentionally attach sensitive learning content.

### Logging

- Avoid `console.log` in committed production code except deliberate diagnostics.
- Prefer structured logging.
- Never log passwords, tokens, Clerk secrets, journal text, microphone recordings, private notes, or raw sensitive user content.

## Testing

### Unit and Integration Tests

Use **Vitest**.

Critical domain logic requires tests, especially:

- SRS stage transitions
- SRS timing
- SRS penalties
- Concurrent/stale review protection
- Level-unlock thresholds
- Practice progression
- Duplicate normalization
- Authorization rules
- Access-tier rules

Time-sensitive tests use fixed timestamps rather than real wall-clock time.

### End-to-End Tests

Use **Playwright** for critical workflows.

Important flows should eventually include:

- Authenticated routing
- Lesson → SRS enrollment
- Review completion
- Settings changes
- Admin curriculum operations
- Progress preservation
- Language switching

### Regression Tests

Bug fixes should include a regression test when practical, especially for domain/business logic.

Do not optimize for an arbitrary global coverage percentage. Require strong coverage for high-risk domain rules instead.

Tests should not depend on production Clerk, Neon, R2, PostHog, or Sentry resources.

## Testing Strategy

The tiers below extend the Testing section above. Each tier answers a different question, and a test in the wrong tier is slow, flaky, or both.

| Tier | Question | Tool | Database | Target runtime |
| --- | --- | --- | --- | --- |
| Unit | Is this rule correct? | Vitest | None | Milliseconds |
| Integration | Do these pieces work together against real SQL? | Vitest | Ephemeral | Seconds |
| End-to-end | Can a user complete this journey? | Playwright | Preview | Under ten minutes total |

Most tests should be unit tests of domain rules. Domain logic is pure and has no excuse for needing a database.

### Unit Tests

- Domain rules are pure functions and are tested without mocks, fakes, or a database.
- If a domain rule cannot be tested without mocking a repository, the rule and its data access are not properly separated. Fix the separation rather than adding the mock.
- Time-dependent logic accepts an injected clock. Never call `Date.now()` inside a domain rule.
- Randomness accepts an injected seed or generator. Review queue ordering must be reproducible in tests.

### Integration Tests

- Run against a real ephemeral PostgreSQL instance with migrations applied, never against a mock or an in-memory substitute with different SQL semantics.
- Each test runs in a transaction that is rolled back, or against a uniquely named schema. Tests must not depend on execution order or on leftover state.
- Cover: authorization and ownership enforcement, transaction boundaries and their rollback behavior, constraint violations, concurrent submission handling, and idempotency replay.
- The transactional invariants in `architecture.md` — a failed review leaving state unchanged, a failed enrollment enrolling nothing — are only meaningfully verifiable at this tier.

### End-to-End Tests

- Cover critical paths only. An end-to-end test that duplicates a unit test costs a hundred times more to run and is far more likely to flake.
- Authenticate through a dedicated test user and a stored authentication state, not by scripting the sign-in form on every test.
- Never assert against production data or production services.
- Seed the required state through the application's own seeding path, so tests exercise real code rather than fixtures that drift from it.

### Test Data

- Build test data with factory functions exposing sensible defaults and accepting overrides. Do not share mutable fixture objects between tests.
- Every test creates the data it needs. A test that only passes after another test has run is a broken test.
- Seed scripts live in a clearly marked seed directory and are the only place hardcoded sample content is permitted.

### Determinism and Flake Policy

- Fixed timestamps for anything time-dependent. No wall-clock reads in assertions.
- Never add a retry to make a domain test pass. A flaky domain test indicates a real race, an ordering dependency, or a hidden clock read.
- Retries are acceptable only in end-to-end tests, and only for genuine environmental flakiness.
- A test quarantined for flakiness gets a tracking note in `progress-tracker.md` and a fix, not indefinite skipping.

---

## Continuous Integration

The pipeline is defined in `architecture.md`. This section covers what the repository must provide for it to work.

### Required Scripts

`package.json` must expose stable script names, because CI depends on them:

```text
typecheck     tsc --noEmit
lint          eslint
format:check  prettier --check
test          vitest run
test:watch    vitest
test:e2e      playwright test
build         next build
db:generate   generate a migration from schema changes
db:migrate    apply pending migrations
db:check      detect drift between schema and migration history
db:seed       load fixture data
```

Renaming a script is a breaking change to CI. Update the workflow in the same commit.

### Local Parity

Anything CI will reject should be catchable locally. Typecheck, lint, and unit tests must all be runnable without network access or cloud credentials.

Do not open a pull request without running typecheck, lint, and tests locally first. Discovering a type error from a CI run wastes several minutes for something that takes seconds locally.

---

## Pull Requests and Commits

- Conventional commit messages: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`.
- Branch names describe the unit: `feat/review-queue-ordering`.
- One feature unit per pull request, as defined in `ai-workflow-rules.md`.
- Pull request descriptions state what changed, how it was verified, and whether a migration is included.
- A pull request containing a migration says so in its title. Schema changes deserve a different level of review attention than component changes.
- Never merge with a failing required check.

---

## Migration Authoring

Extends the Drizzle Schema and Migrations section above.

- Generate migrations; do not hand-write them unless the generator cannot express the change, and say why in a comment when that happens.
- Review every generated migration before committing. Generators produce destructive statements without warning.
- One logical schema change per migration. A migration doing four unrelated things cannot be reasoned about when it fails halfway.
- Never edit a migration that has been merged.
- Index creation on a populated table uses the concurrent form and sits in its own migration.
- Adding a non-nullable column to a populated table requires a default or a backfill-then-constrain sequence across separate migrations.
- Backfills are batched and resumable. A single statement updating every row will lock the table.
- A migration introducing a query pattern also introduces its supporting index.

---

## Idempotency

Implements the architecture section of the same name.

- Progress-affecting mutations accept an idempotency key from the client and validate it as a UUID.
- The key, user ID, endpoint, and a hash of the request payload are persisted under a unique constraint, in the same transaction as the effect.
- A replay with a matching key and payload returns the stored result. A replay with a matching key and a different payload is a conflict error.
- Never implement deduplication with a "check whether it exists, then insert" sequence. That is a race, not a guarantee. Rely on the unique constraint and handle the violation.
- Client code generates one key per logical operation and reuses it across retries. A key regenerated on retry provides no protection.

---

## Pagination and Query Conventions

- Every list endpoint is paginated. There is no unbounded list endpoint.
- Use keyset pagination for unbounded tables: review history, journal entries, audit logs, admin content lists. Offset pagination degrades linearly and breaks under concurrent inserts.
- Pagination responses return the items and an opaque cursor. Never expose raw database offsets or internal ordering keys.
- Enforce a maximum page size server-side. A client-supplied page size is validated and clamped.
- Select explicit columns.
- Any query filtered or ordered on an unindexed column ships with its index in the same change.
- Aggregate counts over large tables are approximate or cached. An exact count on an unbounded table is a full scan.

---

## Rate Limiting Usage

- Call the rate-limit provider through its interface. Domain code never talks to the underlying store.
- Limits are named constants resolved from configuration, not literals in handlers.
- Exceeding a limit returns the structured `RATE_LIMITED` error. Never fail silently and never return a generic 500.
- Progress-affecting mutations fail closed if the limiter is unreachable.
- Rate-limit decisions are logged with the subject and the surface, never with request content.

---

## Feature Flags

- Risky domain changes ship behind a server-evaluated flag.
- Flags are evaluated server-side. A client-evaluated flag is a suggestion, not a gate.
- Every flag has an owner and a removal condition recorded when it is introduced.
- Flags are short-lived. A flag that has outlived its rollout is configuration and belongs in the configuration module.
- Never branch domain logic on a flag deep inside a rule. Branch at the boundary and keep each path independently testable.

---

## Observability in Code

- Every request carries a correlation identifier, included in every log line emitted while handling it. Without one, logs from concurrent users are uncorrelatable.
- Log at boundaries — request entry, external calls, mutations — not inside pure domain functions.
- Structured logs only. No string concatenation into log messages.
- Never log tokens, passwords, session identifiers, journal content, or a user's typed answers.
- Expected domain errors are logged at warning level with their structured code. Unexpected errors are logged at error level with a stack trace and reported to monitoring.
- Instrument the two hot paths — the due-review query and review submission — with timing, so budget regressions are visible rather than inferred.

---

## Performance Rules

- No N+1 queries. Batch related lookups.
- No sequential awaits for independent asynchronous work. Use concurrent resolution.
- Keep client bundles small. Prefer Server Components; push client boundaries as low in the tree as possible.
- Dynamically import heavy client-only libraries.
- Never block a response on analytics or non-critical external calls.
- Cache reads with an explicit tag and an explicit invalidation point. A cache with no defined invalidation is a bug that has not surfaced yet.
- Authoritative learning decisions never read from cache, per `architecture.md`.

---
## Comments and Documentation

- Comments should explain **why**, not restate obvious code.
- Document non-obvious domain rules where useful.
- Avoid excessive AI-generated comments.
- Use TSDoc for exported domain APIs when behavior/invariants are not obvious.
- TODOs must explain what remains and why.
- Missing product decisions belong in `progress-tracker.md` rather than being guessed in code.

## Dependencies

- Prefer existing dependencies before adding new ones.
- Every new dependency must have a clear project need.
- Do not install a package for trivial functionality that can be implemented safely in a few lines.
- Avoid duplicate libraries serving the same purpose.
- Keep dependencies reasonably current, but do not perform unrelated upgrades during feature work.
- Isolate major dependency upgrades into deliberate changes.

Default/approved choices include:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Drizzle ORM
- Zod
- React Hook Form when needed
- CVA
- date-fns when needed
- Motion when needed
- Vitest
- Playwright

## Environment Variables

- Never commit secrets.
- Maintain an `.env.example` with required variable names and safe placeholders/descriptions.
- Server-only secrets must not use `NEXT_PUBLIC_`.
- Validate environment variables at startup through a typed configuration module.
- Application code should read environment values through that module rather than scattering `process.env.*` access across the codebase.
- Maintain separate development, preview, and production configuration.
- Environment identity comes from a single `APP_ENV` value, not from `NODE_ENV`. Preview and production are both production builds and are not distinguishable by `NODE_ENV`.
- Fail fast at startup on missing or malformed required variables. A misconfigured deployment should refuse to start rather than fail unpredictably under load.
- Adding a variable means updating `.env.example`, the typed configuration module, and the deployment environment in the same change.

## File Organization

Use the base structure defined in `architecture.md`:

```text
src/
  app/
  components/
    ui/
    shared/
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

Start each domain simply.

Example:

```text
domains/srs/
  srs-service.ts
  srs-rules.ts
  srs-repository.ts
  srs-schemas.ts
  srs-types.ts
  srs-rules.test.ts
  index.ts
```

Add subfolders only when a domain becomes large enough to justify them.

Each domain's `index.ts` defines its intended public API.

Prefer:

```ts
import { submitReview } from "@/domains/srs";
```

Unit tests should generally be colocated with the code they test.

`lib/` is for genuinely cross-domain utilities and must not become a dumping ground for business logic.

## Git and Code Hygiene

- Do not commit `.next/`, build artifacts, caches, or generated temporary files.
- Keep secrets and local `.env*` files gitignored.
- Commit database migration files.
- Use ESLint and Prettier.
- Avoid unrelated formatting/refactoring in files that do not need to change.
- Keep implementation changes focused on the requested unit.

Before a meaningful implementation is considered complete:

1. Relevant TypeScript checks pass.
2. ESLint passes.
3. Relevant tests pass, including new tests for the behavior added.
4. `npm run build` passes.
5. No invariant in `architecture.md` was violated.
6. Relevant context documentation is updated.
7. `progress-tracker.md` reflects the current state when the change is meaningful.
8. Any schema change ships as a reviewed migration that is safe against the previous application version.
9. Any new query is paginated where unbounded and indexed where filtered or ordered.
10. Any progress-affecting mutation is idempotent, rate limited, and authorized server-side.
11. Frontend work handles loading, empty, error, and success states.
12. No secret, token, or user learning content is logged.
13. Every check the CI pipeline runs would pass on this change.

## AI Implementation Rules

When implementing code:

- Follow `project-overview.md` for product behavior.
- Follow `architecture.md` for system boundaries and invariants.
- Follow this file for implementation conventions.
- Follow `ui-context.md` for visual implementation.
- Follow `ai-workflow-rules.md` for scope and working process.
- Use `progress-tracker.md` for current state and unresolved decisions.

If existing code conflicts with `architecture.md`, prefer the architecture specification and refactor the conflicting implementation when the correction is within current scope.

If correcting the violation would substantially expand the requested work:

1. Do not add another workaround.
2. Do not silently rewrite unrelated architecture.
3. Record the problem/open question in `progress-tracker.md`.
4. Continue only with work that can be completed without violating the architecture.

Never choose convenience over a defined architecture invariant.
