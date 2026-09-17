# Production Infrastructure & CI/CD

Read `AGENTS.md`, `architecture.md`, `code-standards.md`, `project-overview.md`, `ai-workflow-rules.md`, `progress-tracker.md`, the Test Isolation & Critical E2E spec, Spec 19, Spec 20, and relevant infrastructure files before starting.

## Goal

Create Polyglot's real deployment infrastructure and CI/CD pipeline.

This spec turns the existing architecture and partially-written CI workflows into a verified system where:

- every pull request is automatically checked
- every pull request receives an isolated preview environment
- preview data cannot affect production
- collaborators cannot directly modify trusted `main`
- collaborator changes require owner review
- production secrets are unavailable to pull-request workflows
- database migrations are verified before merge
- production migrations run before the new application version is promoted
- merging an approved, green pull request automatically deploys production
- production infrastructure is isolated from development
- the first public Beta can run on Vercel's free Hobby tier
- production AWS curriculum-import infrastructure is promoted separately from development
- failed checks block merge/deployment
- application rollback is possible without attempting unsafe database rollback

This spec is infrastructure work.

Do not add unrelated product features while implementing it.

---

# Locked Decisions

The following decisions are final for this spec.

## CI/CD

Use:

```text
GitHub Actions
```

Do not introduce Jenkins.

---

## Repository

The Polyglot GitHub repository remains:

```text
Private
```

Collaborators may receive normal development/write access but must not receive repository administrator access.

---

## Hosting

Use:

```text
Vercel
```

The initial public Beta uses Vercel's free Hobby tier while the project remains eligible for that tier.

The application should be publicly reachable.

For Beta 0.1, use the normal generated:

```text
*.vercel.app
```

production URL.

A custom domain is deferred.

---

## Deployment

Production deployment occurs automatically after an approved pull request is merged into:

```text
main
```

There is no second manual deployment button required after merge.

---

## Production Data

Production starts clean.

Do not copy:

- development accounts
- development progress
- development audit logs
- sandbox users
- test users
- test curriculum state
- development idempotency records

into production.

---

## Production Curriculum

The final approved Level 1 curriculum enters production through Polyglot's real administrator curriculum workflow.

Do not clone the development database into production to obtain curriculum.

Expected flow:

```text
clean production
→ production administrator created
→ Admin curriculum import
→ review
→ explicit publication
→ learner-visible curriculum
```

---

## Provider Accounts

Use the existing provider accounts where practical.

Create separate resources for:

```text
development
preview
production
```

rather than creating entirely new provider accounts.

---

## AWS

Use the existing AWS account and region.

Production AWS resources must nevertheless be completely separate from development resources.

---

## Terraform

Production Terraform state must use protected remote state.

Do not commit production `.tfstate` files to Git.

---

## Preview Environments

Every same-repository pull request targeting `main` receives an isolated preview environment.

Public fork pull requests are not part of the current collaboration model.

---

## Production Administrator

The repository owner is initially the only Polyglot production administrator.

GitHub repository access does not imply:

- production application admin
- production database access
- AWS access
- Vercel production access
- Clerk production access

---

# Deployment Stages

Polyglot has four practical infrastructure contexts.

```text
Local Development
        ↓
Integration / E2E Testing
        ↓
Pull Request Preview
        ↓
Production
```

Testing environments remain defined by the Test Isolation & Critical E2E spec.

Application environments remain:

```text
development
preview
production
```

via `APP_ENV`.

---

# Public Beta Constraint

The first public deployment may use:

```text
Vercel Production
*.vercel.app
APP_ENV=production
```

However, Clerk's production instance requires an owned production domain.

Until a custom domain exists, the public Beta may temporarily continue using the Clerk development instance.

This is a deliberate temporary exception.

It must be documented in `progress-tracker.md`.

Do not describe the authentication environment as fully production-grade while this exception exists.

Before broader production launch:

```text
custom domain
→ Clerk Production activation
→ production Clerk keys
→ production authentication smoke test
```

must be completed.

The rest of production infrastructure should still be isolated correctly now.

---

# Vercel Hobby Constraint

The free Vercel Hobby plan may be used for Beta while Polyglot remains eligible for personal/non-commercial Hobby usage and remains within plan limits.

Create an upgrade trigger.

Move away from Hobby when any of the following occurs:

- Polyglot becomes commercial
- paid subscriptions launch
- usage exceeds Hobby limits
- required collaboration/security functionality requires Pro
- reliability requirements exceed Hobby capabilities

Do not architect the application around Hobby-specific limitations.

---

# GitHub Plan Prerequisite

Because the repository remains private, required branch/ruleset protections must be available on the repository's GitHub plan.

If the current account does not support branch/ruleset protection on a private repository:

```text
STOP collaborator onboarding
```

Do not grant collaborators unrestricted write access and merely rely on convention.

Upgrade to a GitHub plan that supports enforced private-repository protection before collaboration begins.

---

# Repository Collaboration Model

Repository roles should follow:

```text
Owner
└── Repository Admin

Collaborators
└── Write / Developer-level access
```

Collaborators may:

- clone
- fetch
- create branches
- push feature branches
- open pull requests
- participate in reviews
- work with issues

Collaborators must not receive routine access to:

- repository administration
- branch-rule administration
- production secrets
- production infrastructure credentials
- production databases

---

# Branching Model

Use short-lived branches.

Examples:

```text
feature/footer
feature/settings-notifications
fix/review-count
infra/e2e-pipeline
```

Normal development flow:

```text
main
  ↑
Pull Request
  ↑
feature/*
```

Do not create long-lived environment branches such as:

```text
develop
staging
release
```

unless future requirements justify them.

`main` remains the single trusted integration branch.

---

# Main Branch Protection

Protect:

```text
main
```

Prefer a GitHub ruleset.

Require:

- pull request before merge
- required status checks
- required code-owner review for collaborator changes
- stale approvals dismissed when new commits are pushed
- review conversations resolved
- force pushes blocked
- branch deletion blocked
- branch up to date before merge where appropriate

Do not permit collaborators to bypass these rules.

---

# Owner Bypass

The repository owner must still be able to work independently.

Configure the owner as the only normal bypass actor, using:

```text
Pull-request-only bypass
```

where supported.

This exists because a pull-request author cannot approve their own pull request.

Expected behavior:

### Collaborator PR

```text
Collaborator
→ PR
→ CI
→ owner review
→ owner approval
→ merge
```

### Owner PR

```text
Owner
→ PR
→ CI
→ owner bypasses review requirement through PR
→ merge
```

The owner should still use a pull request.

Do not use the bypass to push directly to `main` during normal development.

---

# CODEOWNERS

Create:

```text
.github/CODEOWNERS
```

The repository owner should own all files.

Conceptually:

```text
* @OWNER_GITHUB_USERNAME
```

Determine the real GitHub username from repository configuration during implementation.

Also explicitly protect ownership of:

```text
/.github/
/.github/CODEOWNERS
/db/migrations/
/infra/
/terraform/
```

where useful.

The primary purpose is ensuring collaborator changes require owner review.

---

# Review Rules

Require:

```text
1 code-owner approval
```

for collaborator-authored pull requests.

Enable:

```text
Dismiss stale approvals when new commits are pushed
```

If code changes after approval:

```text
approval
→ new commit
→ approval invalidated
→ owner reviews again
```

Require unresolved review conversations to be resolved before merge.

---

# Merge Strategy

Use:

```text
Squash merge
```

as the normal merge strategy.

A completed feature branch should become one coherent commit on `main`.

Pull request titles should be meaningful and compatible with the existing conventional-commit/history conventions.

Automatically delete merged feature branches where practical.

---

# Required Status Checks

The final `main` protection should require all critical checks.

Use unique, stable job names.

Required categories:

```text
TypeScript
Lint
Formatting
Unit Tests
Integration Tests
Migration Verification
Build
Critical E2E
Dependency / Security Gate
```

Do not configure a required status check until that workflow has successfully executed at least once and GitHub recognizes the status name.

---

# CI Architecture

The normal pull-request pipeline is:

```text
Pull Request
      ↓
Install
      ↓
Verify
 ├── TypeScript
 ├── ESLint
 └── Formatting
      ↓
Tests
 ├── Unit
 └── Integration
      ↓
Migration Verification
      ↓
Build
      ↓
Preview Deployment
      ↓
Playwright E2E
      ↓
Security Gate
      ↓
Owner Review
      ↓
Merge Allowed
```

Where independent stages can safely run in parallel, they may.

A failed required stage prevents merge.

---

# Existing CI Workflows

Inspect and preserve useful work already present in:

```text
.github/workflows/ci.yml
.github/workflows/migrate.yml
```

These were previously written but not fully executed against real GitHub configuration.

Do not rewrite them unnecessarily.

First review:

- current action SHAs
- current inputs
- permissions
- environment variables
- branch names
- cleanup behavior
- current scripts

Then correct only what is required.

---

# GitHub Action Pinning

Third-party GitHub Actions must be pinned to immutable commit SHAs.

Do not use mutable references such as:

```text
@main
@latest
```

or rely solely on version tags for production workflows.

When introducing or updating an action:

1. confirm the official current action
2. confirm its documented inputs/outputs
3. resolve the real commit SHA
4. pin to that SHA

Never fabricate action SHAs.

---

# CI Installation

CI installs dependencies from the lockfile.

Use:

```text
npm ci
```

with the repository's currently-required peer-dependency handling where necessary.

Do not regenerate dependency resolution inside CI.

The committed lockfile remains authoritative.

---

# CI Permissions

Every workflow uses minimum GitHub token permissions.

Default to:

```text
contents: read
```

and add only permissions required by the specific job.

Do not use:

```text
permissions: write-all
```

without an unavoidable documented reason.

---

# CI Concurrency

Use workflow concurrency groups based on branch/PR.

When a collaborator pushes another commit to the same PR:

```text
old run cancelled
new run begins
```

Do not waste CI resources verifying obsolete commits.

---

# Pull Request Secrets

Pull-request workflows must never receive production credentials.

This includes:

- production Neon credentials
- production Clerk secret
- AWS production credentials
- Vercel production deployment token where avoidable
- R2 production credentials
- Upstash production credentials
- Sentry production credentials
- PostHog production secrets

PR code must be treated as untrusted until reviewed.

Even same-repository collaborator branches must not gain production credentials merely because CI executes them.

---

# GitHub Environments

Create GitHub environments where supported:

```text
preview
production
```

Production secrets belong to:

```text
production
```

not general repository secrets whenever practical.

Production environment secrets must only be consumable by the trusted production workflow running from `main`.

PR workflows must not be able to request the production environment.

---

# Vercel Project

Create or configure the Polyglot Vercel project.

Use:

```text
Production branch: main
```

Initial production hostname:

```text
<project>.vercel.app
```

The deployment must be public.

Do not enable Vercel Authentication/deployment protection on the public production deployment.

Preview deployments may remain separately protected if this does not prevent automated E2E.

---

# Vercel Deployment Ownership

GitHub Actions is the authoritative production promotion mechanism.

This is necessary to guarantee:

```text
production migration
BEFORE
new application deployment
```

Do not allow Vercel Git auto-deployment to race a production migration.

Configure Vercel so production deployment from `main` occurs through the trusted production GitHub Action.

Preview deployments may still use Vercel's Git/preview integration or supported deployment integration.

There must be only one authoritative production deployment path.

---

# Production Deployment Workflow

Create:

```text
.github/workflows/deploy-production.yml
```

Trigger only after trusted code reaches:

```text
main
```

Conceptual order:

```text
main updated
     ↓
verify trusted commit
     ↓
production migration preflight
     ↓
apply production migrations
     ↓
build production artifact
     ↓
deploy to Vercel production
     ↓
smoke check
```

If migration fails:

```text
STOP
```

Do not deploy the new application.

If build fails:

```text
STOP
```

Do not alter the previous working production deployment.

---

# Vercel Production Deployment

Use the supported Vercel deployment tooling from CI.

Production deployment credentials belong only to the trusted production environment.

The workflow should build/deploy the exact commit that was merged to `main`.

Do not rebuild an arbitrary moving branch after verification.

Record the deployed commit SHA where practical.

---

# Preview Deployment

Every same-repository PR targeting `main` receives a Vercel Preview deployment.

The preview should use:

```text
APP_ENV=preview
```

and must not receive production runtime credentials.

Preview must use:

- Clerk development authentication
- isolated preview database
- preview/non-production storage
- preview/non-production rate limiting
- non-production AWS behavior where applicable

---

# Preview Database

Each PR preview receives an isolated Neon branch.

Preferred implementation should use the supported Neon/Vercel preview branching integration when it satisfies the project's isolation requirements.

This is preferred over exposing a powerful Neon management API key to arbitrary PR code.

Expected behavior:

```text
PR #42
      ↓
Vercel Preview
      ↓
Neon preview branch for PR #42
```

The preview branch must never be the production branch.

Production user data must not be copied into preview.

Seed preview from safe curriculum/test fixtures.

---

# Preview Cleanup

When a PR is closed or its preview expires:

```text
preview database branch
→ deleted
```

Prefer provider-supported automatic cleanup where reliable.

If explicit GitHub cleanup automation remains necessary, create:

```text
preview-cleanup.yml
```

and ensure cleanup runs even for closed/unmerged PRs.

Preview resources should not accumulate indefinitely.

---

# Preview Migrations

Before a preview is considered ready:

1. create/attach isolated database branch
2. apply current migrations
3. verify migration success
4. seed approved preview fixture state
5. deploy application
6. run E2E

A migration failure should make the preview unusable and fail its required check.

---

# E2E Workflow

Create:

```text
.github/workflows/e2e.yml
```

Use the committed Playwright suite from the Test Isolation & Critical E2E spec.

Run against the actual Vercel preview URL.

Do not run the critical CI E2E suite against:

```text
localhost
```

when verifying a pull request.

Expected:

```text
Vercel Preview Ready
       ↓
Playwright Chromium
       ↓
critical journeys
       ↓
PASS / FAIL
```

Upload:

- traces
- screenshots
- videos where configured

only on failure.

---

# CI Integration Database

Preserve the existing integration-test strategy.

Each CI run creates a disposable Neon branch for integration tests.

Conceptually:

```text
CI job
→ ephemeral Neon branch
→ migrations
→ integration fixtures
→ test:integration
→ schema verification
→ delete branch
```

This branch is separate from the longer-lived PR preview branch.

CI integration branches and preview branches solve different problems.

---

# Migration Workflow

Preserve and verify:

```text
.github/workflows/migrate.yml
```

It must test:

### Empty Database

```text
empty
→ every migration
→ schema head
```

### Fixture Database

```text
seeded fixture database
→ migrations
→ successful result
```

### Drift

Verify the Drizzle schema and migration history agree.

### Destructive Operations

Detect operations such as:

```text
DROP
ALTER TYPE
SET NOT NULL
```

where applicable.

Destructive migration changes require explicit owner review.

Do not weaken migration safety merely to make CI pass.

---

# Production Migration Rules

Production migrations are:

```text
forward-only
```

Never automatically execute:

```text
migration down
rollback migration
DROP previous schema to restore app
```

Application rollback and database correction are separate operations.

---

# Expand / Migrate / Contract

Breaking schema changes follow:

```text
Deployment A — Expand
add compatible schema

Deployment B — Migrate
backfill / switch behavior

Deployment C — Contract
remove obsolete schema
```

Never combine expand and contract into the same production deployment.

The old application version must remain compatible while the new migration is being applied.

---

# Production Neon

Create a clean production Neon branch/database.

Recommended logical name:

```text
polyglot-production
```

Production uses its own credentials.

Do not create production by cloning current development learner data.

Apply migrations from empty.

Seed only application/system records intentionally required for production.

Curriculum is imported afterward through the real admin workflow.

---

# Production Database Credentials

Application runtime credentials belong in Vercel Production environment variables.

Migration credentials required by GitHub Actions belong only in the GitHub production environment.

Where possible, use separate database roles for:

```text
application runtime
migration/administration
```

with minimum required permissions.

Do not expose migration-level credentials to preview/application code unnecessarily.

---

# Clerk

## Public Beta

Until a custom domain exists:

```text
Vercel Production
+
Clerk Development
```

is the temporary Beta arrangement.

Record this exception explicitly.

Do not copy development test users into future Clerk Production automatically.

---

## Future Production Clerk Activation

When a domain is acquired:

1. attach the custom domain to Vercel
2. activate Clerk Production
3. configure Clerk production domain/DNS
4. set production publishable key
5. set production secret key
6. remove the temporary development-Clerk production exception
7. smoke-test signup/signin/signout/account settings
8. update `progress-tracker.md`

This does not require redesigning CI/CD.

---

# Cloudflare R2

Create separate storage resources where the current application requires persistent media:

```text
polyglot-preview
polyglot-production
```

Development remains isolated.

Production R2 credentials must exist only in production.

Preview may use its own bucket.

Never give preview write access to the production bucket.

If permanent-media functionality is still unused at implementation time, infrastructure may be provisioned without inventing new media features.

---

# Upstash

Create isolated rate-limit backing resources/configuration for:

```text
preview
production
```

Local tests continue using the in-memory provider.

Production progress-affecting mutations must use the real production rate limiter.

Preview must not share rate-limit state with production.

---

# AWS Production Infrastructure

Spec 19's development async curriculum import already exists.

This spec promotes that infrastructure to production.

Use the existing AWS account and region.

Create separate production resources for the existing pipeline:

```text
S3
→ SQS
→ Lambda
→ production Neon
```

Do not reuse development queues, buckets, Lambda functions, dead-letter queues, or SSM parameters.

Names/tags should clearly identify:

```text
environment = production
application = polyglot
```

---

# AWS Authentication from GitHub

Prefer GitHub Actions OIDC and an AWS deployment role.

Do not create long-lived AWS access keys solely for GitHub Actions if OIDC can satisfy the deployment flow.

The GitHub deployment role should have only the permissions required to manage Polyglot's production infrastructure.

---

# AWS Runtime Secrets

Continue the existing SSM Parameter Store pattern for Lambda database credentials and similar runtime secrets.

Do not store production secrets directly in Terraform source.

Do not place secret values in Terraform state.

Do not commit secret-containing `.tfvars`.

---

# Terraform Production State

Create protected remote Terraform state for production.

Recommended properties:

- dedicated backend
- encryption
- versioning
- state locking
- access limited to owner/deployment role
- no public access

Production state must never be committed to Git.

The existing development Terraform setup may be migrated to the same remote-state pattern if practical, but production remote state is mandatory.

---

# Terraform Environments

Separate development and production Terraform state/configuration cleanly.

Do not use one state file containing both environments.

Conceptually:

```text
development state
production state
```

A development `terraform apply` must be incapable of modifying production resources.

---

# Security Workflow

Create:

```text
.github/workflows/security.yml
```

Run on:

```text
pull_request
scheduled weekly
```

Include free/current tooling for:

- dependency vulnerability audit
- secret scanning
- static analysis

Fail the required pull-request security gate for high/critical dependency issues according to architecture policy.

Do not automatically upgrade dependencies inside the security workflow.

Dependency updates should arrive as reviewable pull requests.

---

# Production Secrets Review

Before initial deployment, inventory every environment variable.

Classify each as:

```text
public client configuration
server secret
development-only
preview-only
production-only
CI-only
```

Verify no server secret uses:

```text
NEXT_PUBLIC_
```

Do not blindly copy `.env.local` into Vercel Production.

---

# Environment Configuration

Use the existing typed configuration layer.

Required environment identity:

```text
development
preview
production
```

via:

```text
APP_ENV
```

Do not infer authoritative environment behavior from:

- hostname
- branch name
- `NODE_ENV`

inside domain/application code.

---

# Account Deletion Cron

If Spec 20's account-deletion finalizer is complete, configure the production Vercel Cron job.

The job should invoke only the defined secure finalization endpoint.

Protect the cron endpoint using the existing supported authentication/secret pattern.

A random public request must not be able to trigger destructive account deletion processing.

The normal cadence should match the Settings spec.

Do not invent additional account-deletion behavior here.

---

# Production Administrator Bootstrap

Create the first production user normally.

Promote only the repository owner to:

```text
admin
```

using the existing authoritative role mechanism.

Document the bootstrap procedure.

Do not introduce:

```text
if email === "..."
```

or any permanent hardcoded admin bypass.

Once bootstrapped, production admin access must continue through the normal server-authoritative role system.

---

# Production Curriculum Bootstrap

After deployment:

1. sign into production administrator account
2. open Admin curriculum
3. import final approved Spanish Level 1
4. resolve required intake/review issues
5. review curriculum
6. publish intentionally
7. verify learner-visible content
8. create a fresh learner smoke account
9. verify Level 1 lesson availability

Do not publish automatically simply because an import succeeded.

---

# Production Deployment Smoke Test

After every production deployment, run a small non-destructive smoke test.

At minimum verify:

```text
production URL responds
landing page renders
authentication entry point renders
protected route enforcement works
database-backed application request succeeds
```

Do not run destructive E2E reset flows against production.

The full Playwright suite belongs to isolated preview environments.

---

# Rollback

Application rollback:

```text
Vercel previous deployment
```

Database rollback:

```text
never automatic
```

If production application code is defective but schema remains compatible:

```text
restore previous Vercel deployment
```

If the schema itself needs correction:

```text
new forward migration
```

Do not attempt to reverse production migration history automatically.

---

# Failed Production Migration

If a production migration fails:

1. stop deployment
2. leave current application version serving
3. investigate migration
4. create corrected forward migration where required
5. rerun pipeline

Do not deploy application code that expects a migration which failed.

---

# Failed Production Deployment

If migration succeeds but application deployment fails:

- retain current working deployment
- investigate build/deployment
- do not reverse successful migration automatically

This is why migrations must remain compatible with the previously deployed application.

---

# Infrastructure Cost Posture

Keep Beta infrastructure within free tiers where practical.

Monitor:

- Vercel
- Neon
- Clerk
- R2
- Upstash
- AWS

Do not introduce paid infrastructure merely for theoretical future scale.

Upgrade because of measured:

- usage
- commercial requirements
- reliability requirements
- security requirements
- collaboration requirements

not speculation.

---

# Workflow Files

Expected workflow set after this spec:

```text
.github/workflows/
├── ci.yml
├── migrate.yml
├── e2e.yml
├── security.yml
├── deploy-production.yml
└── preview-cleanup.yml        # only if provider-native cleanup is insufficient
```

If Neon/Vercel native preview integration safely replaces custom preview cleanup, do not create redundant workflow machinery solely to match this filename list.

Update architecture documentation to reflect the actual verified approach.

---

# No Production Secrets in PRs

Add explicit verification that pull requests cannot access production credentials.

A collaborator should be able to modify:

```text
application code
tests
workflow proposals
```

but their unmerged code must not receive production secrets.

Production-secret access occurs only after:

```text
review
→ approval
→ merge into protected main
→ trusted production workflow
```

---

# First Real Pipeline Verification

Do not call this spec complete after merely writing YAML.

Create a real non-destructive pull request and verify the entire pipeline.

Expected:

```text
feature branch
      ↓
Pull Request
      ↓
CI
      ↓
migration checks
      ↓
preview deployment
      ↓
isolated preview database
      ↓
E2E
      ↓
security
      ↓
owner approval
      ↓
merge
      ↓
production migration
      ↓
production deploy
      ↓
production smoke test
```

Record the result.

---

# Collaborator Verification

Before inviting a real collaborator, verify using a non-owner account or equivalent repository-permission check that:

- collaborator can create/push a feature branch
- collaborator can open PR
- collaborator cannot push directly to `main`
- collaborator cannot merge without owner approval
- collaborator cannot dismiss/bypass required owner review
- collaborator cannot disable branch protections
- collaborator cannot access production secrets
- new commit after approval invalidates approval
- required CI failure blocks merge

Do not rely only on the owner's admin view.

---

# Public Beta Verification

Verify the final Beta deployment is publicly reachable at:

```text
https://<project>.vercel.app
```

Verify:

- no Vercel deployment protection blocks visitors
- landing page renders signed out
- Clerk development authentication works for Beta testing
- production Neon is isolated
- development data is absent
- production admin exists
- approved Level 1 curriculum can be published
- fresh learner can access the real learning loop

Record the remaining custom-domain/Clerk-production requirement clearly.

---

# Documentation

Update relevant context:

```text
architecture.md
code-standards.md
project-overview.md
ai-workflow-rules.md
progress-tracker.md
.env.example
```

Only change behavior documentation where implementation actually establishes or intentionally refines the architecture.

Record:

- verified environment topology
- real CI workflows
- production promotion ordering
- branch/ruleset behavior
- preview environment lifecycle
- production Terraform state approach
- public Beta Clerk exception
- remaining custom-domain requirement

---

# Scope Limits

This spec does not implement:

- Sentry application instrumentation
- PostHog application instrumentation
- health/readiness endpoints
- uptime monitoring
- detailed production security headers
- CSP tuning
- backup/restore drills
- R2 backup mirroring
- database restore drills
- load testing
- full performance profiling
- final cross-browser release QA
- a custom production domain
- Clerk Production before a custom domain exists
- payment infrastructure
- Stripe
- production subscription enforcement
- additional languages

Those belong to subsequent production-safety/release specs.

---

# Verification

## Repository

Verify:

```text
private repository
protected main
owner CODEOWNER
collaborator direct push blocked
force push blocked
branch deletion blocked
```

---

## Pull Request Pipeline

Verify a real PR passes:

```text
typecheck
lint
format
unit
integration
migration verification
build
preview
critical E2E
security
```

Intentionally make one temporary test PR fail a required check and confirm merge is blocked.

Do not merge intentionally broken verification code.

---

## Preview Isolation

Verify two separate preview runs cannot affect:

```text
production
development
each other's isolated preview state
```

Verify closing the PR cleans up preview database resources.

---

## Production Pipeline

Verify:

```text
merge to main
→ production migration
→ production deploy
→ smoke test
```

Confirm deployment does not begin before required migration stage succeeds.

---

## Secrets

Verify:

- production credentials absent from PR jobs
- production credentials absent from logs
- production credentials absent from repository history
- production Terraform state absent from Git
- production AWS credentials not stored as long-lived GitHub keys where OIDC is used
- only expected public variables use `NEXT_PUBLIC_`

---

# Check When Done

## GitHub

- [ ] Repository remains private
- [ ] GitHub plan supports enforced private-repository protections before collaborators are added
- [ ] `main` is protected
- [ ] Pull requests are required
- [ ] Owner CODEOWNER is configured
- [ ] Collaborator PRs require owner approval
- [ ] Owner has pull-request-only bypass for own PRs where supported
- [ ] Stale approvals are dismissed after new commits
- [ ] Review conversations must be resolved
- [ ] Force pushes to `main` are blocked
- [ ] `main` deletion is blocked
- [ ] Required CI checks are configured
- [ ] Collaborators do not have admin access
- [ ] Production secrets are inaccessible to PR workflows

## CI

- [ ] Existing `ci.yml` reviewed and verified
- [ ] Existing `migrate.yml` reviewed and verified
- [ ] `e2e.yml` exists and runs against previews
- [ ] `security.yml` exists
- [ ] production deployment workflow exists
- [ ] actions use minimum permissions
- [ ] third-party Actions are pinned to verified commit SHAs
- [ ] workflow concurrency cancels obsolete PR runs
- [ ] CI installs from lockfile
- [ ] workflow/job names are stable and unique
- [ ] all required workflows have executed successfully at least once

## Preview

- [ ] Every same-repository PR receives a preview
- [ ] Preview uses `APP_ENV=preview`
- [ ] Preview never receives production database credentials
- [ ] Preview never receives production Clerk credentials
- [ ] Preview has isolated Neon branch
- [ ] Preview uses safe fixture data
- [ ] Preview migration succeeds before E2E
- [ ] Critical E2E runs against actual preview URL
- [ ] Preview database resources are cleaned up after PR close

## Production Vercel

- [ ] Vercel project configured
- [ ] `main` is trusted production source
- [ ] production deployment is controlled by trusted GitHub Action
- [ ] automatic Vercel production deployment cannot race production migrations
- [ ] generated `*.vercel.app` URL is public
- [ ] `APP_ENV=production`
- [ ] Hobby eligibility/limits documented
- [ ] production smoke test passes
- [ ] previous deployment can be restored

## Production Neon

- [ ] Clean production Neon environment exists
- [ ] Development learner data was not copied
- [ ] Production credentials are isolated
- [ ] Production migrations apply from empty to head
- [ ] production runtime connects successfully
- [ ] failed migration prevents application promotion
- [ ] migration corrections remain forward-only

## Clerk

- [ ] Public Beta Clerk-development exception documented
- [ ] production deployment does not pretend Clerk Development is final production auth
- [ ] custom-domain/Clerk-Production activation remains explicitly tracked
- [ ] production application admin is limited to owner
- [ ] no hardcoded admin email bypass exists

## Other Providers

- [ ] Preview/production R2 resources isolated where used
- [ ] Preview/production Upstash resources isolated
- [ ] production rate limiting uses real provider
- [ ] development/test rate limiting remains isolated

## AWS / Terraform

- [ ] Production AWS resources are separate from development
- [ ] Existing AWS account/region retained
- [ ] production S3/SQS/Lambda pipeline exists
- [ ] production Lambda connects only to production database
- [ ] production SSM parameters are separate
- [ ] GitHub uses OIDC for AWS where practical
- [ ] production Terraform state is remote
- [ ] production Terraform state is encrypted/versioned/locked
- [ ] production `.tfstate` is not committed
- [ ] development and production Terraform state cannot modify each other's resources

## Curriculum

- [ ] Production starts without development curriculum state copied from DB
- [ ] owner production admin exists
- [ ] approved Level 1 imported through real admin workflow
- [ ] curriculum reviewed
- [ ] curriculum explicitly published
- [ ] fresh learner can see published content

## Account Deletion

- [ ] Production deletion cron configured if Spec 20 deletion is complete
- [ ] cron endpoint is authenticated
- [ ] arbitrary external requests cannot trigger finalization

## Final Pipeline

- [ ] real PR created
- [ ] CI passed
- [ ] migration verification passed
- [ ] isolated preview deployed
- [ ] preview E2E passed
- [ ] security passed
- [ ] owner approval required
- [ ] merge succeeded
- [ ] production migration ran first
- [ ] production deployment ran second
- [ ] production smoke test passed
- [ ] production is publicly reachable
- [ ] no development/test data leaked into production
- [ ] `progress-tracker.md` records the verified result
- [ ] remaining custom-domain + Clerk Production step is clearly tracked
