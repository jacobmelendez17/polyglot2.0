# Test Isolation & Critical E2E

Read `AGENTS.md`, `architecture.md`, `code-standards.md`, `project-overview.md`, `ai-workflow-rules.md`, `progress-tracker.md`, and relevant feature specs before starting.

## Goal

Make Polyglot's automated testing environment isolated, deterministic, repeatable, and safe enough to serve as a deployment gate.

This spec has two primary goals:

1. Completely isolate automated test data from normal development data.
2. Create a committed Playwright suite covering Polyglot's critical learner and administrator journeys.

When complete:

* integration tests cannot mutate normal development data
* E2E tests cannot mutate normal development or production data
* integration and E2E tests do not share a database
* tests start from known deterministic state
* tests do not depend on execution order
* all known integration-test failures are resolved
* critical workflows are verified through a real browser
* Playwright becomes a normal project dependency rather than ad hoc verification tooling
* failures produce useful diagnostics
* the suite is ready to be connected to Vercel preview deployments and GitHub required checks in the following CI/CD spec

This spec does not configure the final production deployment pipeline.

---

# Testing Environment Model

Polyglot uses separate environments for development, integration testing, and browser testing.

```text
Development
DATABASE_URL
      │
      └── Normal development Neon branch


Integration Tests
TEST_DATABASE_URL
      │
      └── Dedicated Neon test branch


End-to-End Tests
E2E_DATABASE_URL
      │
      └── Dedicated Neon E2E branch
```

Use three independent database targets.

Recommended Neon branches:

```text
polyglot-dev
polyglot-test
polyglot-e2e
```

The exact existing development branch name does not need to change if one already exists.

The important invariant is:

```text
DATABASE_URL !== TEST_DATABASE_URL
DATABASE_URL !== E2E_DATABASE_URL
TEST_DATABASE_URL !== E2E_DATABASE_URL
```

None may point at production.

---

# Integration Test Database

Create a permanent non-production Neon branch dedicated to local integration testing.

Recommended name:

```text
polyglot-test
```

Configure:

```text
TEST_DATABASE_URL
```

to point exclusively at this branch.

The normal development application continues using:

```text
DATABASE_URL
```

Integration tests must never fall back to `DATABASE_URL`.

---

# Integration Database Safety Guard

Before any integration migration, seed, cleanup, or test runs, validate the database environment.

The test harness must verify:

* `TEST_DATABASE_URL` exists
* `TEST_DATABASE_URL` differs from `DATABASE_URL`
* the environment is not production
* the target is explicitly intended for testing
* no production database configuration is being used

If safety cannot be established:

```text
FAIL CLOSED
```

Do not run the suite.

Do not silently substitute another database.

Do not print connection strings in errors, logs, screenshots, artifacts, or documentation.

---

# Integration Database Preparation

Before the integration suite:

1. connect to `TEST_DATABASE_URL`
2. apply committed migrations
3. verify schema/migration consistency
4. create only the deterministic fixture state required by the suite
5. run integration tests

Integration tests continue using real PostgreSQL/Neon semantics.

Do not replace PostgreSQL with:

* SQLite
* mocked repositories
* in-memory database substitutes
* fake SQL implementations

---

# Integration Test Isolation

Normal integration tests should run inside transactions that are rolled back after each test wherever possible.

Each test must own the data it requires.

Tests must not depend on:

* another test running first
* existing development users
* existing development curriculum
* current authored Level 1 size
* leftover progress
* accumulated audit records
* accumulated idempotency keys
* manually-created application data

Shared mutable fixture state is prohibited.

---

# Committed-State Tests

Some tests legitimately require committed database state, including:

* real concurrency tests
* multi-connection behavior
* idempotency lock behavior
* functionality impossible to verify inside one rollback transaction

These tests must:

* create uniquely identifiable records
* avoid existing application data
* clean up committed data after themselves
* remain repeatable

A failed test cleanup must not silently contaminate future tests.

---

# Remove Shared-Database Assumptions

Review the existing integration suite for logic created while:

```text
TEST_DATABASE_URL === DATABASE_URL
```

Remove assumptions about real application state.

Tests asking broad questions such as:

* list all curriculum items
* count curriculum statuses
* paginate an entire language
* query all audit events
* count all idempotency rows

must create isolated fixture data rather than asserting against whatever happens to exist in development.

The integration suite must continue working as the real Polyglot curriculum grows.

---

# Existing Integration Failures

Resolve all currently known integration-test failures.

Do not:

* declare existing failures acceptable
* permanently skip failing tests
* loosen correct assertions solely to make the suite green
* add retries to deterministic integration tests
* delete meaningful tests to reduce failures

If a failing test exposes a real product bug:

1. fix the product behavior
2. preserve or add the regression test

Completion requirement:

```text
0 known integration-test failures
```

---

# Test Data Factories

Create or consolidate reusable factory helpers where appropriate.

Factories may cover:

* users
* languages
* levels
* vocabulary groups
* learning items
* vocabulary items
* grammar items
* sentences
* learner progress
* level progress
* review state
* settings
* admin curriculum state
* audit state where necessary

Factories should:

* expose sensible defaults
* accept explicit overrides
* generate unique identifiers where needed
* avoid shared mutable objects

Do not create one enormous universal fixture.

Prefer small factories composed according to the test.

---

# Deterministic Time

Time-dependent tests must use controlled time.

Do not wait for actual SRS intervals.

Use fixed or injected timestamps for:

* review eligibility
* next-review scheduling
* streak calculations
* vacation periods
* review forecasts
* deletion timing
* start-of-day logic
* other time-sensitive domain behavior

Browser time remains non-authoritative.

The server/domain layer determines review eligibility.

---

# E2E Database

Create a second permanent non-production Neon branch dedicated exclusively to Playwright.

Recommended name:

```text
polyglot-e2e
```

Configure:

```text
E2E_DATABASE_URL
```

The E2E application runtime uses this database as its application database while Playwright is running.

Conceptually:

```text
E2E_DATABASE_URL
      ↓
isolated Next.js E2E server
      ↓
Playwright
      ↓
real routes / Server Actions
      ↓
real domain logic
      ↓
polyglot-e2e Neon branch
```

Do not run Playwright against a normal development server connected to development data.

---

# E2E Database Safety Guard

Before E2E setup, reset, or seeding:

Verify:

```text
E2E_DATABASE_URL exists

E2E_DATABASE_URL != DATABASE_URL

E2E_DATABASE_URL != TEST_DATABASE_URL

APP_ENV is not production
```

The application must also be running under an explicit E2E/test configuration.

If the target cannot be proven safe:

```text
FAIL CLOSED
```

Never fall back to a development or production database.

---

# E2E Database Reset

The E2E database should begin each complete test run from a deterministic known state.

Create a controlled reset/setup script specifically for the E2E branch.

It may:

1. clear test-owned application data
2. apply current migrations
3. seed deterministic fixture curriculum
4. prepare required learner/admin application records

The reset command must contain the same E2E database safety guard.

Destructive E2E reset behavior must be impossible against development or production.

---

# E2E Curriculum Fixture

Do not use the actively-authored real Spanish Level 1 curriculum as the foundation of critical E2E tests.

Create a small deterministic test curriculum.

It remains real Polyglot curriculum data and should use:

```text
Language: es-MX
```

Include enough content to exercise:

* onboarding
* lesson selection
* vocabulary
* grammar
* lesson quiz
* SRS enrollment
* reviews
* curriculum publication
* dashboard counts

Example structure:

```text
Spanish — es-MX

Level 1

Vocabulary Group 1
- several published vocabulary items

Vocabulary Group 2
- several published vocabulary items

Grammar
- several published grammar items

Admin Test Content
- at least one pending item
```

The exact words are not important.

The fixture should remain intentionally small and stable.

Content edits to the real launch curriculum must not cause E2E failures.

---

# Seed Through Real Application Structures

E2E setup must use the real schema and existing application/domain boundaries where practical.

Do not maintain a fake parallel representation of Polyglot curriculum.

The E2E fixture should fail when meaningful schema/domain assumptions change rather than silently drifting away from the application.

---

# No Test-Only Public APIs

Do not add production-accessible routes such as:

```text
/api/test/reset
/api/test/create-user
/api/test/make-review-due
/api/test/change-stage
```

solely for Playwright.

Test setup should use:

* setup scripts
* factories
* test database helpers
* domain/application helpers where appropriate
* Playwright global setup

Do not introduce production backdoors for testing convenience.

---

# Playwright

Install Playwright as a normal committed development dependency.

Create the project structure appropriate to the repository, including:

```text
playwright.config.*
tests/e2e/
```

Expose:

```text
npm run test:e2e
```

Do not continue using temporary `--no-save` Playwright installations for routine verification.

---

# Browser Coverage

The initial committed E2E suite uses:

```text
Chromium
```

for the full critical-path suite.

Also include one mobile Chromium smoke path using a representative mobile viewport.

Recommended:

```text
390 × 844
```

Do not run the full suite against Chromium + Firefox + WebKit in this spec.

Broader cross-browser/device verification belongs to the final release-candidate spec.

---

# Clerk Test Environment

Use the existing non-production Clerk development environment.

Create two permanent test-only identities:

```text
Polyglot E2E Learner
Polyglot E2E Admin
```

These identities must not be real personal accounts.

The administrator identity receives the proper Polyglot admin role through the existing role system.

The learner remains a normal learner.

Never use production Clerk for automated testing.

---

# Authentication Strategy

Use Clerk's supported testing integration to authenticate Playwright.

Do not automate the normal Clerk sign-in UI for every test.

Do not attempt to bypass Cloudflare Turnstile.

Generate stored authenticated browser states for:

```text
learner
admin
```

Conceptually:

```text
playwright/.auth/learner.json
playwright/.auth/admin.json
```

These files must be gitignored.

Never commit:

* cookies
* Clerk session tokens
* passwords
* auth-state JSON
* Clerk secret keys

---

# Signup Scope

Automated signup through Clerk's public UI is not required by this spec.

The E2E suite verifies Polyglot's authentication boundaries, not Clerk's implementation.

Signup/signin provider UI receives a manual launch smoke check later.

This avoids building fragile automation around bot-protection challenges that do not represent Polyglot application behavior.

---

# Authentication E2E

## Signed-Out Route Protection

Verify that a signed-out browser attempting to access a protected learner route is redirected into the expected authentication flow.

At minimum verify one representative protected route.

---

## Authenticated Learner

Using the stored learner authentication state:

Verify the learner can access:

* dashboard
* lessons
* reviews
* settings

according to their prepared state.

---

## Learner Cannot Access Admin

Using the learner state:

```text
learner
→ /admin
→ denied or redirected
```

The exact response should follow existing authorization behavior.

---

## Administrator Access

Using the administrator state:

```text
admin
→ /admin
→ success
```

Server-side authorization remains authoritative.

---

## Sign Out

Verify that a signed-in learner can sign out and subsequently loses access to protected learner pages.

Do not test Clerk's internal authentication mechanics beyond the application's observable behavior.

---

# Critical E2E Philosophy

E2E tests answer:

> Can a real user complete the important Polyglot journey through the browser?

They do not duplicate every lower-level test.

Do not use Playwright to exhaustively verify:

* every SRS calculation
* every normalization rule
* every validation rule
* every authorization permutation
* every lesson ordering algorithm
* every database constraint
* every idempotency edge case
* every rate-limit condition

These belong primarily to unit and integration tests.

Critical E2E coverage should stay small, valuable, and understandable.

---

# Critical Flow — New Learner

Prepare:

* authenticated E2E learner
* onboarding incomplete
* no learner progress
* deterministic E2E Spanish curriculum

Verify:

```text
Authenticated learner
→ onboarding
→ Spanish selection
→ curriculum preference
→ dashboard
```

Confirm:

* onboarding completes
* `es-MX` becomes active
* curriculum preference saves
* learner reaches dashboard
* dashboard loads successfully
* lessons are available according to the seeded test curriculum

This test does not automate Clerk signup.

---

# Critical Flow — Lesson → SRS

Prepare:

* onboarded learner
* published eligible E2E curriculum
* no progress for selected lesson items

Flow:

```text
Dashboard
→ Lessons
→ Study
→ Quiz
→ miss one question intentionally
→ missed question returns later
→ complete quiz
→ completion
→ Dashboard
```

Verify:

* lesson starts
* study content renders
* quiz loads
* deliberately incorrect content returns according to lesson behavior
* entire lesson completes successfully
* lesson items enter SRS only after completion
* learner returns successfully to dashboard
* visible learner state reflects completed learning

Also verify the important unfinished-session rule:

```text
start lesson
→ exit or refresh before completion
→ restart lesson
```

and confirm the unfinished lesson did not create authoritative SRS progress.

Do not use E2E to validate every lesson selection permutation.

---

# Critical Flow — Review → Progress

Prepare through E2E setup:

* learner with SRS-enrolled items
* at least one item already due

Do not wait for real SRS time to pass.

Flow:

```text
Dashboard
→ Reviews
→ answer required review prompts
→ complete review item
→ finish/leave review
→ Dashboard
```

Verify:

* dashboard shows reviews due
* due item appears
* review can be submitted
* completed item no longer appears as due when appropriate
* progress is persisted
* dashboard data updates

Use a correct review path for the principal E2E journey.

Penalty mathematics remain covered at lower test tiers.

---

# Critical Flow — Progress Persistence

After earning actual progress:

```text
earn progress
→ refresh
→ navigate elsewhere
→ return
```

Verify progress remains.

Then:

```text
sign out
→ restore/sign into learner session
→ return to dashboard
```

Verify the same progress still exists.

This proves learner progress is persisted server-side rather than existing only in browser state.

---

# Critical Flow — Settings Persistence

Do not automate every Settings control.

Choose one representative authoritative server-persisted setting.

Flow:

```text
Settings
→ modify setting
→ save
→ refresh
```

Verify the value persists.

Then open a fresh browser context for the same authenticated learner.

Verify the server-backed setting remains.

This proves cross-session/device-style persistence.

Local-only appearance preferences do not count as this test.

---

# Critical Flow — Reset Entire Account

Once the Spec 20 Reset Entire Account functionality is complete:

Prepare the E2E learner with:

* lesson progress
* review progress
* representative settings/state

Flow:

```text
Settings
→ Danger Zone
→ Reset Entire Account
→ required confirmation
→ reset
```

Verify the exact reset semantics already defined by the Settings spec.

Do not redefine reset behavior here.

This operation is safe because it runs only against the dedicated E2E learner and E2E database.

---

# Critical Flow — Delete Account Request

The repeatable E2E suite must **not permanently destroy its Clerk test identity**.

Test:

```text
Settings
→ Delete Account
→ required verification/confirmation
→ deletion pending
→ Cancel deletion
→ normal account state restored
```

Verify:

* pending state appears correctly
* scheduled deletion can be cancelled
* cancellation restores the account state defined by the Settings spec

Do not wait seven days.

Do not permanently delete the shared E2E Clerk identity.

---

# Delete Account Finalization Integration Test

The actual destructive finalization path belongs at the integration tier.

Using controlled time and disposable database records, verify:

```text
deletion requested
→ pending period elapsed
→ finalizer executes
→ application data deletion behavior is correct
```

Test:

* not-yet-due deletion is ignored
* due deletion is finalized
* cancelled deletion is not finalized
* repeated finalizer execution is safe/idempotent where required
* partial failure does not leave invalid account state

Provider-level Clerk identity destruction should be mocked/tested at the provider boundary or validated separately where appropriate, not by destroying the permanent E2E identity every test run.

---

# Critical Flow — Admin Publication

Prepare:

* E2E administrator
* isolated pending curriculum item
* normal E2E learner

Admin flow:

```text
Admin
→ Curriculum
→ locate pending E2E content
→ publish
```

Verify publication succeeds.

Then use the learner state.

Verify the newly published content becomes learner-visible where appropriate.

This proves the critical boundary:

```text
Pending
→ explicit administrator publication
→ learner-visible
```

Never modify the real launch Level 1 curriculum during automated tests.

---

# Admin Authorization Regression

Using the learner:

```text
GET /admin
→ denied
```

Using the administrator:

```text
GET /admin
→ allowed
```

Detailed role combinations remain integration-test concerns.

---

# Browser Coverage Gaps

This spec creates committed automated coverage for critical journeys.

It does not convert every previous manual browser verification into Playwright.

In particular, exhaustive visual/browser sweeps for:

* every Settings page
* Decks
* every Admin screen
* every onboarding slide
* every responsive breakpoint
* every theme combination

belong to the later release-candidate verification spec unless directly required by a critical flow above.

---

# Mobile Smoke Test

Add one mobile Chromium smoke test at approximately:

```text
390 × 844
```

Use one representative authenticated learner flow.

Recommended:

```text
Dashboard
→ Lessons or Reviews
→ interact with primary controls
```

Verify:

* page renders
* navigation remains usable
* primary controls are reachable
* no horizontal page overflow
* no blocking desktop-only layout defect

Do not duplicate the full E2E suite on mobile.

---

# Selectors

Prefer accessible, user-facing selectors:

```text
getByRole()
getByLabel()
getByText()
```

Use `data-testid` only when no stable semantic selector is appropriate.

Do not select elements using:

* generated CSS classes
* Tailwind class strings
* DOM child positions
* fragile component hierarchy
* arbitrary implementation details

A harmless visual refactor should not destroy a critical workflow test.

---

# Waiting and Synchronization

Do not use arbitrary sleeps such as:

```ts
await page.waitForTimeout(3000)
```

to stabilize tests.

Wait for observable application state:

* route changes
* expected heading
* enabled button
* loading indicator disappears
* expected content appears
* network-backed UI state updates

A test that requires arbitrary sleeps should be treated as incorrectly synchronized until proven otherwise.

---

# Flake Policy

Local E2E retries:

```text
0
```

Do not use retries to hide:

* race conditions
* test contamination
* incorrect cleanup
* missing waits
* unstable selectors
* application defects

The future CI pipeline may allow:

```text
1 retry
```

only for genuine browser/environment instability.

A quarantined test must:

* be recorded in `progress-tracker.md`
* include the reason
* include a follow-up requirement
* not remain skipped indefinitely

---

# Parallelism

Initial critical E2E execution should use:

```text
1 Playwright worker
```

because the suite uses permanent learner/admin test identities.

This avoids concurrent tests mutating the same account state.

Tests must still be independently setup and runnable.

Do not depend on this ordering:

```text
onboarding.spec
→ lesson.spec
→ review.spec
```

Each test or test group must establish the state it requires.

If E2E runtime later becomes a problem, introduce multiple isolated learner identities before increasing parallelism.

---

# Failure Diagnostics

Configure Playwright to retain useful evidence on failure.

Capture:

* trace
* screenshot
* video where useful

Prefer:

```text
retain on failure
```

rather than storing artifacts for every successful run.

Artifacts must not expose:

* authentication tokens
* passwords
* secrets
* private production user information

---

# Browser Errors

Critical tests should detect unexpected:

* uncaught page exceptions
* application-level console errors
* failed critical network requests

Known harmless third-party browser noise may be narrowly filtered if documented.

Do not globally ignore console errors.

---

# External Service Boundaries

The critical test suite must not require:

* production Neon
* production Clerk
* production R2
* production AWS
* production PostHog
* production Sentry

Do not include the entire asynchronous AWS curriculum-import infrastructure in the core E2E suite.

The core browser suite should remain deterministic and focused on learner/admin application behavior.

The existing async import system retains its own provider/infrastructure testing.

---

# Commands

The repository should expose stable commands:

```text
npm run test
npm run test:integration
npm run test:e2e
```

Add any supporting commands needed for safe E2E setup, for example:

```text
npm run e2e:setup
```

or equivalent.

Names should follow existing project conventions.

Do not rename existing stable scripts unnecessarily.

---

# Environment Variables

Document safe variable names in `.env.example`.

Relevant testing variables include:

```text
DATABASE_URL
TEST_DATABASE_URL
E2E_DATABASE_URL
```

and whatever Clerk testing credentials/configuration are required by the existing Clerk testing integration.

Never include real values in:

* `.env.example`
* source files
* workflow files
* test fixtures
* documentation

---

# Gitignored Test State

Ensure repository ignore rules cover generated browser authentication state and other test artifacts.

Examples:

```text
playwright/.auth/
test-results/
playwright-report/
```

according to the final project structure.

Failure artifacts produced by CI may later be uploaded by GitHub Actions instead of committed.

---

# CI Boundary

This spec makes the E2E suite **CI-ready**.

It does not implement the final workflow that runs Playwright against a Vercel preview deployment.

The following Production Infrastructure & CI/CD spec will handle:

```text
PR
→ Vercel preview ready
→ isolated preview resources
→ Playwright critical suite
→ required GitHub status
→ production promotion allowed
```

Do not prematurely combine that deployment infrastructure into this spec.

---

# Existing CI Integration Tests

Preserve the architecture's existing plan for CI integration tests:

```text
GitHub Actions
→ ephemeral Neon branch
→ migrations
→ seed
→ integration suite
→ schema drift check
→ branch deleted
```

The permanent:

```text
polyglot-test
```

branch exists for reliable local integration testing.

CI continues using disposable per-run branches rather than sharing the permanent local test branch.

---

# E2E Future CI Model

The later CI/CD spec should be able to run this committed suite against an isolated preview environment.

This spec should therefore avoid assumptions tied only to:

```text
localhost
```

Configuration such as the E2E base URL should be environment-driven.

Local example:

```text
http://localhost:<port>
```

Future CI example:

```text
Vercel preview URL
```

The test logic should remain the same.

---

# Verification

## Fast Verification

Run:

```text
typecheck
lint
unit tests
build
```

All must pass.

---

## Integration Verification

Run the complete integration suite against:

```text
polyglot-test
```

Required:

```text
0 known failures
```

Run the suite at least three consecutive times.

Expected:

```text
Run 1 → PASS
Run 2 → PASS
Run 3 → PASS
```

Between runs:

* do not reset the development database
* do not manually repair test state
* do not reorder tests to make them pass

Confirm normal development data was not modified.

---

## E2E Verification

Run the committed Chromium suite against:

```text
polyglot-e2e
```

Required flows:

* signed-out protected-route handling
* authenticated learner routing
* learner denied from Admin
* administrator allowed into Admin
* onboarding
* lesson → SRS enrollment
* unfinished lesson does not enroll
* due review → persisted progress
* progress survives refresh
* progress survives sign-out/sign-in
* representative Settings persistence
* Reset Entire Account
* Delete Account request → pending → cancel
* admin curriculum publication
* published content becomes learner-visible
* mobile Chromium smoke flow

Run the full suite repeatedly.

Required:

```text
Run 1 → PASS
Run 2 → PASS
Run 3 → PASS
```

No manual cleanup should be required between runs.

---

# Scope Limits

This spec does not:

* create production infrastructure
* create the production Neon branch
* configure production Clerk
* configure production AWS
* configure final Vercel production deployment
* implement GitHub branch protection
* finish `e2e.yml`
* create the complete deployment pipeline
* test Clerk signup through Turnstile
* permanently delete the shared E2E Clerk user
* use the real Level 1 curriculum as automated test fixtures
* run the entire suite across Firefox
* run the entire suite across WebKit
* perform full visual regression testing
* perform load testing
* performance-test large user populations
* automate every Settings control
* automate every Admin screen
* reproduce every SRS rule in the browser
* create public test-only application APIs

Those belong to other test tiers or subsequent deployment/release specs.

---

# Check When Done

## Integration Isolation

* [ ] Dedicated `polyglot-test` Neon branch exists
* [ ] `TEST_DATABASE_URL` points only to the test branch
* [ ] `TEST_DATABASE_URL !== DATABASE_URL`
* [ ] Integration database safety guard exists
* [ ] Missing/unsafe test configuration fails closed
* [ ] Integration tests never silently fall back to `DATABASE_URL`
* [ ] Connection strings are never printed
* [ ] Integration tests use real PostgreSQL
* [ ] Normal integration tests use rollback isolation
* [ ] Committed/concurrency tests clean up their own state
* [ ] Tests no longer depend on development curriculum
* [ ] Tests no longer depend on development users
* [ ] Tests no longer depend on accumulated audit/idempotency state
* [ ] Existing shared-database assumptions are removed
* [ ] All known integration-test failures are resolved
* [ ] Full integration suite passes three consecutive times
* [ ] Running integration tests does not modify normal development data

## E2E Isolation

* [ ] Dedicated `polyglot-e2e` Neon branch exists
* [ ] `E2E_DATABASE_URL` points only to the E2E branch
* [ ] E2E database differs from development database
* [ ] E2E database differs from integration-test database
* [ ] E2E safety guard exists
* [ ] E2E reset/setup fails closed against unsafe environments
* [ ] deterministic `es-MX` E2E curriculum fixture exists
* [ ] E2E does not depend on real launch Level 1 content
* [ ] no public test-only application routes were added

## Playwright

* [ ] Playwright is a committed project dependency
* [ ] Playwright config exists
* [ ] `tests/e2e/` or equivalent committed suite exists
* [ ] `npm run test:e2e` exists
* [ ] full critical suite uses Chromium
* [ ] one mobile Chromium smoke path exists
* [ ] initial worker count is 1
* [ ] arbitrary sleeps are not used for synchronization
* [ ] accessible selectors are preferred
* [ ] failure trace capture is enabled
* [ ] failure screenshot capture is enabled
* [ ] unexpected page errors are surfaced
* [ ] unexpected application console errors are surfaced

## Authentication

* [ ] dedicated Clerk development learner identity exists
* [ ] dedicated Clerk development administrator identity exists
* [ ] personal administrator account is not used
* [ ] production Clerk is not used
* [ ] learner auth state can be generated
* [ ] admin auth state can be generated
* [ ] auth state files are gitignored
* [ ] auth tokens/passwords are never committed
* [ ] normal Clerk signup UI is not automated
* [ ] signed-out route protection passes
* [ ] learner Admin denial passes
* [ ] administrator Admin access passes
* [ ] sign-out behavior passes

## Critical Learner Flows

* [ ] onboarding E2E passes
* [ ] Spanish language selection persists
* [ ] curriculum preference persists
* [ ] dashboard loads for new learner
* [ ] lesson E2E passes
* [ ] deliberately missed lesson question returns correctly
* [ ] completed lesson enrolls items in SRS
* [ ] unfinished lesson does not enroll items
* [ ] due-review E2E passes
* [ ] review progress persists
* [ ] dashboard state updates after learning/review activity
* [ ] progress survives refresh
* [ ] progress survives sign-out/sign-in
* [ ] representative server-backed Settings persistence passes

## Destructive / Administrative Flows

* [ ] Reset Entire Account E2E passes
* [ ] reset uses only disposable E2E state
* [ ] Delete Account request E2E passes
* [ ] pending-deletion state is verified
* [ ] Delete Account cancellation E2E passes
* [ ] normal E2E does not permanently destroy its Clerk identity
* [ ] deletion finalization is integration-tested with controlled time
* [ ] admin curriculum publication E2E passes
* [ ] learner can observe newly published E2E curriculum where appropriate
* [ ] automated tests never modify real launch curriculum

## Final Verification

* [ ] fast verification passes
* [ ] integration suite passes three consecutive times
* [ ] E2E suite passes three consecutive times
* [ ] no manual data repair is needed between runs
* [ ] development data remains unchanged by tests
* [ ] production resources are never accessed
* [ ] `.env.example` documents testing variable names safely
* [ ] generated auth/test artifacts are gitignored
* [ ] `architecture.md` updated where implementation changes require it
* [ ] `code-standards.md` updated where implementation changes require it
* [ ] `progress-tracker.md` records completed work and verification
* [ ] suite is ready for the following CI/CD spec to execute against preview deployments
