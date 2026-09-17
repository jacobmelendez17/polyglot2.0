# Structured Logging & Request Tracing

Read `AGENTS.md`, `architecture.md`, `code-standards.md`, `project-overview.md`, `ai-workflow-rules.md`, `progress-tracker.md`, and relevant domains/providers before implementation.

## Goal

Add centralized structured logging and tracing throughout Polyglot so production failures can be diagnosed without reproducing them blindly.

When something breaks, logs should make it possible to determine:

- which request or operation failed
- which function/domain operation failed
- which route or Server Action triggered it
- which user/account was affected when safe to record
- what step the operation reached
- which external dependency was involved
- how long the operation took
- whether a database transaction committed or rolled back
- whether the error was expected or unexpected
- the application's structured error code
- which deployment/environment produced the error
- all related log entries belonging to the same request

Logging must never expose sensitive learner content, authentication secrets, credentials, or private application data.

---

# Logging Philosophy

Do not add arbitrary `console.log()` statements throughout the codebase.

Logging should be:

```text
centralized
structured
searchable
traceable
privacy-safe
```

Prefer events such as:

```text
review.complete.started
review.complete.succeeded
review.complete.failed
```

rather than:

```text
"here"
"review worked"
"something broke"
```

A log should explain what operation was occurring.

---

# Central Logging Module

Create one shared server-side observability/logging boundary.

Suggested conceptual structure:

```text
lib/
  observability/
    logger
    trace-context
    operation-tracer
```

or the closest location consistent with the existing architecture.

Application code should use the shared logger rather than creating independent logging implementations.

The logger should support structured metadata.

Conceptually:

```ts
logger.info({
  operation: "review.complete",
  traceId,
  userId,
  itemId,
  durationMs,
});
```

Production logs should be machine-readable structured output.

Development logs may additionally use easier-to-read formatting.

---

# Log Levels

Use consistent levels.

## DEBUG

Detailed development/troubleshooting information.

Examples:

- operation entered
- branch/decision selected
- count of records returned
- sanitized configuration decision
- retry attempt

Debug output may be disabled or reduced in production.

---

## INFO

Normal important system events.

Examples:

- lesson completed
- review completed
- account reset completed
- admin published curriculum
- import job completed
- production background task completed

Do not log every trivial render/read operation at INFO.

---

## WARN

Unexpected but recoverable situations.

Examples:

- external provider temporarily unavailable
- slow database operation
- stale request rejected
- rate limit triggered
- retry required
- missing optional media
- duplicate operation safely ignored
- fallback behavior used

---

## ERROR

An operation failed.

Examples:

- review transaction failed
- lesson enrollment failed
- database operation failed
- provider request failed
- unauthorized mutation attempt
- Lambda job failed
- account deletion finalization failed

Errors should contain enough structured context to diagnose the failure.

---

## FATAL

Reserve for failures where the process/environment cannot safely continue.

This should be rare in a serverless application.

---

# Trace IDs

Every important request or operation should receive a unique:

```text
trace_id
```

Recommended format:

```text
UUID
```

Example:

```text
trace_id = 8ecfdcd2-...
```

Every log generated while processing the same operation should contain the same trace ID.

Example:

```text
[trace abc123] review request received
[trace abc123] user authorized
[trace abc123] review transaction started
[trace abc123] SRS result calculated
[trace abc123] database transaction failed
```

This allows one production failure to be searched as a single chain.

---

# Request ID

HTTP requests should also have a:

```text
request_id
```

A request ID identifies the actual HTTP request.

A trace ID identifies the larger logical operation.

Often they may initially be the same.

The design should not prevent them from becoming distinct later if asynchronous work or nested operations require it.

---

# Trace Context

Create a request-scoped trace context.

Server-side code should be able to access the current:

```text
trace_id
request_id
operation
```

without manually passing them through every function argument.

Use an appropriate request-local/context mechanism supported by the runtime.

Do not introduce global mutable trace state shared across concurrent requests.

---

# Standard Log Fields

Where applicable, structured logs should contain:

```text
timestamp
level
environment
service
release
trace_id
request_id
operation
component
function
route
method
duration_ms
status
error_code
error_type
```

Optional safe identifiers may include:

```text
user_id
language_id
item_id
level_id
lesson_session_id
review_session_id
import_id
job_id
```

Only include identifiers useful for diagnosis.

Do not dump entire database objects into logs.

---

# Function / Operation Name

Important logs should identify the logical function or operation that produced them.

Prefer stable logical names such as:

```text
reviews.completeReview
lessons.completeLesson
users.resetAccount
curriculum.publishItem
imports.processImport
```

Do not rely solely on JavaScript stack traces to tell you where something failed.

Stack traces remain useful for unexpected errors, but the structured operation name should make the failure understandable immediately.

---

# Operation Tracing

Create a reusable wrapper/helper for important operations.

Conceptually:

```ts
withTrace("reviews.completeReview", async () => {
  ...
})
```

It should be able to automatically record:

```text
operation started
operation succeeded
operation failed
duration
trace ID
```

Do not require every function to manually reproduce identical logging boilerplate.

---

# Request Boundaries

Add logging at major application entry points.

## Route Handlers

Log important route requests including:

```text
route
method
trace_id
status
duration
```

Do not log request bodies automatically.

---

## Server Actions

Important Server Actions should be traced similarly.

Example:

```text
settings.update
curriculum.publish
review.complete
lesson.complete
account.reset
```

---

# Authentication

Log authentication/authorization outcomes where useful.

Examples:

```text
auth.required
auth.user_resolved
auth.denied
authorization.denied
admin.authorization.denied
```

Safe context:

```text
trace_id
internal_user_id
route
required_role
```

Do not log:

```text
password
session cookie
Clerk token
JWT
authorization header
secret key
```

Do not routinely log email addresses.

---

# Domain Services

The highest-value logging should surround important domain operations.

Do not log every pure helper function.

Log operations where failure changes user-visible behavior or persistent state.

---

# SRS Reviews

Review completion is one of the most important traced operations.

Trace:

```text
review started
review eligibility validated
review result calculated
transaction started
progress updated
review event written
next review scheduled
transaction committed
review completed
```

On failure include safe context such as:

```text
user_id
item_id
current_stage
operation
error_code
trace_id
```

Do not log:

- the learner's typed answer
- accepted answers
- example-sentence content

---

# Lesson Completion

Trace:

```text
lesson completion requested
lesson session validated
items validated
transaction started
SRS enrollment started
progress rows created
transaction committed
lesson completed
```

Failure should reveal whether the problem occurred:

```text
before transaction
during enrollment
during commit
after commit
```

Never log complete lesson content.

---

# Dashboard

Dashboard reads generally do not need verbose success logging.

Log:

- aggregation failures
- unusually slow aggregation
- database/provider failures
- impossible/inconsistent state

Do not generate INFO logs every time a normal dashboard successfully loads.

---

# Settings

Trace authoritative settings mutations.

Examples:

```text
settings.account.update
settings.general.update
settings.lesson.update
settings.review.update
settings.vacation.enable
settings.vacation.disable
```

Log:

- operation
- user ID
- setting category
- success/failure
- duration

Do not log sensitive setting values unless explicitly known to be safe.

Prefer:

```text
settings.review.updated
```

instead of dumping:

```json
{
  "allSettings": "..."
}
```

---

# Danger Zone

Danger Zone operations require especially clear logs.

Trace:

```text
account.reset.requested
account.reset.confirmed
account.reset.started
account.reset.completed
account.reset.failed
```

and:

```text
account.delete.requested
account.delete.cancelled
account.delete.finalize.started
account.delete.finalize.completed
account.delete.finalize.failed
```

These events should include:

```text
trace_id
user_id
operation
status
duration
error_code
```

Do not log verification codes or authentication credentials.

---

# Curriculum Administration

Administrative mutations should be logged.

Examples:

```text
curriculum.item.created
curriculum.item.updated
curriculum.item.archived
curriculum.item.published
curriculum.item.moved
curriculum.level.updated
curriculum.group.updated
```

Include useful safe identifiers:

```text
admin_user_id
item_id
level_id
language_id
```

Do not duplicate the complete changed curriculum object into application logs if an audit system already records detailed changes.

Logs answer:

> Did the operation work?

Audit logs answer:

> Who changed what?

Keep those concerns distinct.

---

# Curriculum Imports

Imports should have strong tracing because they span multiple systems.

Use:

```text
import_id
```

as persistent correlation context.

Trace:

```text
import.created
upload.presigned
upload.completed
import.queued
lambda.started
file.downloaded
file.parsed
rows.resolved
import.needs_review
import.confirmed
commit.started
commit.completed
import.failed
```

Every service involved should include the same:

```text
import_id
```

where available.

---

# AWS Lambda

Every Lambda invocation should log:

```text
function
environment
aws_request_id
job_id/import_id
operation
duration
status
```

When Lambda fails, logs should clearly identify the stage.

Example:

```text
curriculum_import.parse.failed
```

is preferable to:

```text
Lambda error
```

---

# Queue Processing

For SQS messages trace:

```text
message received
message validated
processing started
processing succeeded
processing failed
retrying
dead-lettered
```

Useful fields:

```text
job_id
import_id
message_id
receive_count
```

Do not log the entire raw message if it may contain sensitive content.

---

# Database Operations

Do not log every SQL query by default.

That creates too much noise and can leak values.

Instead log database failures at repository/transaction boundaries.

Examples:

```text
database.transaction.failed
database.connection.failed
database.constraint_violation
database.timeout
```

Include:

```text
repository
operation
duration_ms
error_code
trace_id
```

---

# Transaction Tracing

High-risk transactions should clearly show their lifecycle.

Example:

```text
review.transaction.started
review.transaction.committed
```

or:

```text
review.transaction.started
review.transaction.rollback
review.transaction.failed
```

This is particularly important for:

- review completion
- lesson SRS enrollment
- account reset
- account deletion
- curriculum publication
- bulk imports

---

# Slow Database Operations

Add slow-operation warnings.

Use a configurable threshold rather than scattering hardcoded timing checks.

For example:

```text
database.query.slow
```

with:

```text
repository
operation
duration_ms
```

Do not log SQL parameters containing user content.

---

# Provider Calls

Trace important calls across provider boundaries.

Examples:

```text
clerk
neon
r2
upstash
aws
```

Log:

```text
provider
operation
status
duration_ms
trace_id
```

Example:

```text
provider=upstash
operation=rate_limit.check
status=failed
```

Never log provider secrets or full authorization headers.

---

# Rate Limiting

Useful events:

```text
rate_limit.checked
rate_limit.exceeded
rate_limit.provider_failed
```

Record:

```text
policy
authenticated/anonymous
operation
```

Avoid storing raw IP addresses unless there is a clearly established security need.

If anonymous correlation is needed, prefer an appropriately privacy-conscious derived identifier.

---

# Idempotency

Important idempotency events should be visible.

Examples:

```text
idempotency.new
idempotency.replayed
idempotency.in_progress
idempotency.failed
```

Include:

```text
operation
trace_id
```

Do not expose raw security-sensitive keys.

A shortened fingerprint may be logged if correlation is useful.

---

# External Failures

Provider failures should preserve both:

```text
Polyglot operation
external dependency
```

Example:

```text
operation=curriculum.import.upload
provider=s3
error_code=UPLOAD_FAILED
```

This is much more useful than only receiving an AWS SDK stack trace.

---

# Browser / Client Errors

Client-side errors should eventually feed the centralized observability system.

Important browser failures include:

- React error boundaries
- unexpected page exceptions
- failed critical API requests
- unhandled promise rejections

Do not create large amounts of browser console logging.

During production, serious browser errors should be sent through the approved monitoring/error provider rather than relying on the user's browser console.

---

# Error Boundaries

Major application areas should have useful error boundaries where the existing Next.js architecture permits them.

When an unexpected UI/server rendering failure occurs, record:

```text
route
trace_id where available
error type
release
environment
```

The user-facing error should remain friendly.

The detailed diagnostic belongs in logs/error monitoring.

---

# Expected vs Unexpected Errors

Logs must distinguish normal business rejection from system failure.

For example:

```text
REVIEW_NOT_DUE
```

may be expected validation behavior.

That should generally be:

```text
WARN
```

or lower depending on circumstances.

But:

```text
DATABASE_CONNECTION_FAILED
```

is:

```text
ERROR
```

Do not report every expected validation failure as a production incident.

---

# Structured Error Codes

Where Polyglot already has application error codes, include them.

Example:

```text
error_code=REVIEW_NOT_DUE
error_code=RATE_LIMITED
error_code=UNAUTHORIZED
```

Do not force operators to parse error-message strings to understand what happened.

---

# Error Objects

Unexpected exceptions should preserve:

```text
error name
error message
stack trace
cause
```

where supported.

Structured metadata should be attached separately.

Do not stringify an entire arbitrary request/database object into the error log.

---

# Performance Timing

Trace duration for important operations.

Examples:

```text
review.complete = 83ms
dashboard.aggregate = 142ms
curriculum.publish = 46ms
```

This allows logging to help diagnose both:

```text
broken
```

and:

```text
working but very slow
```

---

# Release Information

Production logs should identify the deployed application version.

Prefer:

```text
git commit SHA
```

or equivalent deployment identifier.

Include:

```text
release
environment
```

This lets a failure be tied back to the exact deployed code.

---

# Environment

Every log should identify:

```text
development
preview
production
```

Production and preview logs must be distinguishable.

Do not rely on reading the hostname later.

---

# Privacy Rules

Never log:

- passwords
- authentication tokens
- cookies
- session IDs where they function as credentials
- Clerk secrets
- Neon connection strings
- AWS secret keys
- R2 credentials
- Upstash credentials
- presigned upload URLs containing credentials
- raw authorization headers
- journal entries
- private notes
- microphone recordings
- full typed learner answers
- complete request bodies by default

---

# User Identification

When user correlation is useful, prefer:

```text
internal user UUID
```

Do not routinely log:

```text
email
full name
username
```

unless an explicitly approved operational use requires it.

---

# Learning Content

Do not log raw:

```text
vocabulary answer
grammar answer
sentence response
journal text
private note
```

Prefer IDs:

```text
item_id
sentence_id
review_session_id
```

Operators should be able to diagnose system behavior without reading a learner's private learning content.

---

# Redaction

The central logger should provide a redaction mechanism for known sensitive fields.

At minimum protect names such as:

```text
password
token
secret
authorization
cookie
session
apiKey
databaseUrl
connectionString
```

Logging safety should not depend entirely on every caller remembering what is sensitive.

---

# Log Volume

Do not log everything.

Prioritize:

### Always log failures

For significant server operations.

### Log important persistent mutations

Such as:

- reviews
- lessons
- admin publishing
- account resets
- account deletion
- imports

### Sample/omit routine successful reads

Such as:

- simple curriculum reads
- normal dashboard reads
- static content requests

unless they are slow or fail.

---

# Recommended Trace Example

A successful review might produce conceptually:

```text
INFO
trace_id=abc123
operation=review.complete
event=review.started

DEBUG
trace_id=abc123
operation=review.complete
event=review.eligibility.validated

DEBUG
trace_id=abc123
operation=review.complete
event=transaction.started

INFO
trace_id=abc123
operation=review.complete
event=transaction.committed

INFO
trace_id=abc123
operation=review.complete
event=review.completed
duration_ms=91
```

A failed review could produce:

```text
ERROR
trace_id=abc123
operation=review.complete
function=completeReview
event=transaction.failed
error_code=DATABASE_ERROR
duration_ms=57
```

Searching:

```text
trace_id=abc123
```

should reveal the entire path.

---

# Recommended Import Trace

Example:

```text
trace_id=xyz789
import_id=import-123

admin.import.requested
upload.created
upload.completed
sqs.message.sent
lambda.started
import.file.downloaded
import.parse.started
import.parse.completed
import.commit.started
import.commit.failed
```

The failure immediately reveals:

```text
The request reached Lambda.
Parsing worked.
Commit failed.
```

rather than simply:

```text
Import failed.
```

---

# Developer Experience

Development logs should make debugging easier without requiring an external dashboard.

Important failure output should be readable locally.

For example:

```text
ERROR reviews.completeReview
trace=abc123
item=...
DATABASE_TRANSACTION_FAILED
```

Production can use structured JSON suitable for Vercel/log aggregation.

---

# Sentry Integration Boundary

This spec should prepare logs/traces to integrate with Sentry.

When Sentry is configured:

- unexpected errors should report to Sentry
- trace ID should be attached where possible
- release/environment should match structured logs
- logs and Sentry events should be cross-referenceable

Do not send sensitive learning content to Sentry.

Structured application logs remain useful even when Sentry exists.

---

# What Should Be Logged

High priority:

```text
Authentication / authorization failures
Server Action failures
Route-handler failures
SRS review completion
Lesson completion / SRS enrollment
Database transaction failures
Settings mutations
Danger Zone actions
Admin curriculum mutations
Curriculum imports
AWS Lambda execution
SQS job processing
Provider failures
Rate-limit failures
Idempotency behavior
Background/cron jobs
Unexpected React/server errors
Slow critical operations
```

Lower priority:

```text
routine successful reads
static asset requests
component renders
pure domain helper calls
normal button clicks
```

---

# Tests

Test the observability layer itself.

Verify:

- trace IDs are generated
- nested operations keep the same trace ID
- concurrent requests do not share trace context
- operation wrapper records success
- operation wrapper records failure
- duration is recorded
- error code is preserved
- sensitive configured fields are redacted
- passwords/tokens cannot appear in normal logger serialization
- production logging does not accidentally emit full request bodies

Add targeted tests to representative critical operations.

Do not write a separate logging test for every application function.

---

# Failure Verification

Intentionally trigger safe failures in non-production environments.

Examples:

```text
invalid review request
unauthorized admin route
forced integration-test transaction failure
invalid import fixture
mock provider failure
```

Verify logs clearly reveal:

```text
what failed
where it failed
which trace it belonged to
which error code occurred
```

---

# Scope Limits

This spec does not:

- build a custom logging dashboard
- store logs inside Polyglot's PostgreSQL database
- log every function invocation
- log every SQL query
- expose learner content for debugging
- implement business analytics
- replace admin audit logs
- add arbitrary client-side console logging
- add production alert paging
- create a full distributed tracing platform

It establishes the logging/tracing foundation those systems may consume later.

---

# Check When Done

- [ ] Central structured logger exists
- [ ] Production logging uses structured machine-readable output
- [ ] Development logs remain readable
- [ ] Log levels are standardized
- [ ] Trace IDs exist
- [ ] Request IDs exist
- [ ] Trace context survives nested server operations
- [ ] Concurrent requests cannot leak trace state
- [ ] Important operations identify their logical function/operation
- [ ] Operation start/success/failure can be traced
- [ ] Important operations include duration
- [ ] Environment is attached
- [ ] release/deployment identifier is attached
- [ ] Route-handler failures are logged
- [ ] important Server Action failures are logged
- [ ] authentication/authorization failures are traceable
- [ ] review completion is traced
- [ ] lesson completion/enrollment is traced
- [ ] transaction failures identify rollback/failure
- [ ] important Settings mutations are traced
- [ ] account reset is traced
- [ ] account deletion lifecycle is traced
- [ ] admin curriculum mutations are traced
- [ ] curriculum imports carry import/job correlation
- [ ] Lambda failures identify processing stage
- [ ] queue failures are traceable
- [ ] provider failures identify provider + operation
- [ ] rate-limit failures are traceable
- [ ] idempotency replay/in-progress behavior is traceable
- [ ] slow critical operations produce warnings
- [ ] unexpected errors preserve stack/cause where available
- [ ] structured application error codes appear in logs
- [ ] raw passwords are never logged
- [ ] tokens/cookies/auth headers are never logged
- [ ] database connection strings are never logged
- [ ] learner typed answers are never logged
- [ ] journal/private-note content is never logged
- [ ] central sensitive-field redaction exists
- [ ] trace behavior is tested
- [ ] redaction behavior is tested
- [ ] representative failure paths have been manually inspected
- [ ] logs are useful enough to determine what function/operation failed
- [ ] `architecture.md` / `code-standards.md` / `progress-tracker.md` updated as necessary
