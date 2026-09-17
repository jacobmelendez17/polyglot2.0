Asynchronous Curriculum Imports with AWS Lambda

**Cost objective:** $0/month at expected Polyglot usage

## 1. Goal

Move Polyglot's existing curriculum CSV/TSV preview and commit work out of the Next.js request lifecycle and into asynchronous AWS Lambda jobs.

The feature must preserve the existing curriculum import behavior. Lambda is an execution environment for the existing importer, not a second implementation of curriculum-import rules.

The resulting architecture is:

```text
Admin Browser
     |
     | authenticated request
     v
Next.js / Polyglot
     |
     | create import + presigned upload
     v
Amazon S3
     |
     | ObjectCreated
     v
Amazon SQS
     |
     v
AWS Lambda
     |
     | existing Polyglot import services
     v
Neon PostgreSQL
```

The same worker handles both:

1. asynchronous import preview/validation;
2. asynchronous confirmed import execution.

No curriculum data becomes learner-facing merely because it was imported. Existing Pending/draft/publication rules remain authoritative.

---

# 2. Existing Behavior Is Authoritative

This feature must reuse, not recreate, the existing Polyglot import system.

The Lambda worker must delegate to the existing domain functions responsible for:

- CSV/TSV parsing;
- header and field validation;
- level/group resolution;
- vocabulary vs. grammar detection;
- duplicate detection;
- `resolveImportRow`;
- `create`;
- `update`;
- `move`;
- `unchanged`;
- blocked/review-required classification;
- manually authored field protection;
- preservation of permanent item identity;
- draft handling for existing published items;
- dictionary matching for vocabulary;
- audit events;
- idempotency;
- transaction handling.

There must never be separate rules such as:

```text
Next.js importer rules
Lambda importer rules
```

Instead:

```text
                    ┌── Next.js
Shared Import Logic ┤
                    └── Lambda
```

The old Next.js import execution path should be removed once the Lambda flow is verified.

Next.js remains responsible for orchestration and UI, not curriculum processing.

---

# 3. Existing CSV Contract

The current CSV/TSV contract remains authoritative.

Required columns:

```text
word
translation
level
group
```

Existing optional columns continue to work.

Existing aliases, UTF-8 BOM handling, CRLF handling, and CSV/TSV support remain unchanged.

Vocabulary groups use their existing per-level group positions.

`group = 5` remains the existing grammar sentinel.

For grammar rows:

```text
word        → structure
translation → primaryMeaning
group 5     → grammar item
```

Grammar rows continue to bypass vocabulary dictionary matching.

Import infrastructure must not redefine this convention.

---

# 4. File Limits

Version 1 limits:

```text
Maximum file size: 5 MB
Maximum rows:       5,000
Encoding:           UTF-8
Formats:            CSV / TSV
```

Both the web upload path and Lambda must validate these limits.

Client-side validation is convenience only.

Server/Lambda validation is authoritative.

A file exceeding either limit must be rejected before curriculum mutation.

---

# 5. Authorization

Only an authenticated Polyglot **Admin** may:

- create an import;
- receive an upload URL;
- upload curriculum for processing;
- review import results;
- resolve review-required rows;
- confirm an import;
- retry a failed import;
- archive an import;
- permanently delete an archived import;
- promote a development import to production.

Authorization must be checked server-side using Polyglot's existing role/authorization model.

The browser must never be trusted to provide:

```text
role = admin
userId = ...
permissions = ...
```

The initiating user must be resolved through the authenticated Polyglot user record.

Lambda jobs must carry the already-resolved internal Polyglot actor ID so the existing audit system can attribute changes correctly.

Lambda itself does not decide whether somebody is an Admin.

---

# 6. Creating an Import

Admin selects a `.csv` or `.tsv` file.

The browser calls a lightweight Next.js action/API.

Next.js must:

```text
1. Authenticate user.
2. Resolve internal Polyglot user.
3. Verify Admin permission.
4. Validate filename/type/basic file metadata.
5. Create curriculum_imports record.
6. Generate S3 object key.
7. Generate short-lived presigned upload.
8. Return upload information.
```

The browser uploads directly to S3.

The CSV must not be proxied through the Next.js server.

Example object key:

```text
imports/{importId}/source.csv
```

or:

```text
imports/{importId}/source.tsv
```

The original filename is stored as database metadata but must not determine the S3 path.

Presigned upload credentials must:

- be short lived;
- permit only the intended object;
- never expose AWS credentials to the browser.

---

# 7. Preview Pipeline

Uploading the source object triggers:

```text
S3 ObjectCreated
      ↓
SQS
      ↓
Lambda
```

The preview Lambda job:

```text
QUEUED_FOR_PREVIEW
        ↓
PREVIEWING
        ↓
Parse
        ↓
Validate
        ↓
Resolve against current Neon data
        ↓
Store preview result
        ↓
NEEDS_REVIEW or READY_TO_IMPORT
```

The worker must use the same Polyglot parsing and resolution functions as the existing importer.

S3/SQS duplicate event delivery must be harmless.

Preview processing must therefore be idempotent.

---

# 8. Preview Classifications

Existing classifications remain:

```text
CREATE
UPDATE
MOVE
UNCHANGED
BLOCKED / NEEDS REVIEW
```

The UI should summarize results:

```text
spanish-level-2.csv

57 rows

42 Create
 8 Update
 3 Move
 3 Unchanged
 1 Needs Review
```

Each row must display enough information for an Admin to understand what Polyglot intends to do.

For updates, show changed fields.

For moves, show previous and proposed placement.

For problems, show a human-readable explanation.

---

# 9. Review-Required Rows

No bad/problematic row may be silently ignored.

Every problematic row becomes:

```text
NEEDS_REVIEW
```

The Admin must explicitly resolve every such row before confirmation becomes available.

Version 1 resolution is:

```text
SKIP ROW
```

Examples:

```text
Row 18
Level 7 has no Group 3.

Needs Review

[Skip Row]
```

```text
Row 31
Multiple live curriculum items match "banco".

Needs Review

[Skip Row]
```

If the actual CSV data must be corrected, the Admin must correct the source file and upload a new import.

The import interface is not a spreadsheet editor.

Homonyms continue to be authored through the existing Admin curriculum workflow rather than created implicitly from a CSV.

The **Confirm Import** control must remain unavailable until every review-required row has an explicit disposition.

---

# 10. Admin Confirmation

Uploading a file must never mutate curriculum.

The first Lambda invocation performs only preview/validation.

Flow:

```text
Upload
   ↓
Preview Lambda
   ↓
Admin Review
   ↓
Admin explicitly confirms
   ↓
Commit job queued
```

Confirmation is a new authenticated request.

Next.js must again:

```text
Authenticate
Resolve internal user
Verify Admin permission
Verify import state
Record confirmation
Enqueue COMMIT job
```

A previously authorized upload does not grant permanent authorization to commit it later.

---

# 11. Commit Queue

Confirmation sends a small SQS message containing identifiers only.

Example conceptual payload:

```json
{
  "version": 1,
  "jobType": "COMMIT_IMPORT",
  "importId": "...",
  "actorUserId": "..."
}
```

CSV contents must never be embedded into SQS messages.

The worker retrieves the source file from S3 and authoritative import state from Neon.

SQS batch size should initially be:

```text
1
```

One curriculum import job therefore corresponds to one Lambda job.

This keeps retries, transactions, idempotency, and failure attribution simple.

---

# 12. Mandatory Revalidation at Commit

The commit worker must never trust the stored preview as proof that the same action remains valid.

Before mutation, it must reload current database state and rerun the existing importer resolver.

Example:

```text
PREVIEW

comer → UPDATE
```

An Admin edits curriculum before confirmation.

The commit worker now determines:

```text
comer → BLOCKED
```

The worker must not silently use either result.

If the authoritative result has materially changed since preview:

```text
Abort commit
      ↓
No curriculum writes
      ↓
Generate refreshed preview
      ↓
Import → NEEDS_REVIEW
```

The UI must prominently flag:

```text
Import changed since preview.

Curriculum changed after this preview was generated.
Review the updated actions before importing.
```

Affected rows should additionally indicate:

```text
CHANGED SINCE PREVIEW
```

The Admin must review and confirm again.

---

# 13. Material Preview Changes

A commit must return to review when any selected row changes materially in:

- classification;
- matched curriculum item;
- destination level;
- destination group;
- item type;
- fields that would be modified;
- duplicate/homonym status;
- blocked status.

Changes to unrelated curriculum do not invalidate the import.

A mere timestamp change does not invalidate the import.

---

# 14. Atomic Commit

Once the final preview remains valid, selected mutations execute atomically.

```text
BEGIN TRANSACTION

create
update
move
audit
other required curriculum writes

COMMIT
```

If a database/system failure occurs:

```text
ROLLBACK
```

There must never be a partially committed curriculum import.

Example:

```text
54 approved rows

27 succeed
row 28 throws
```

Result:

```text
0 committed rows
```

not:

```text
27 committed rows
```

Existing database transaction and idempotency infrastructure must be reused.

---

# 15. Existing Re-import Rules

Re-import behavior must remain unchanged.

A matching existing item is not deleted and recreated.

Its permanent `learning_items` identity is preserved so existing:

- SRS state;
- learner progress;
- review history;
- deck membership;
- learner content;
- other references

remain intact.

Existing manually authored field overrides continue to protect authored values from import replacement.

An omitted optional CSV column must never erase an existing value.

Existing published items continue to use the current draft behavior where applicable.

Structural moves continue to follow existing curriculum move rules.

---

# 16. Imported Content Status

Successful import does not mean publication.

New curriculum items remain:

```text
PENDING
```

Published-item edits continue to follow the existing draft behavior.

Lambda must never automatically publish curriculum.

The existing Admin publication workflow remains the only path by which pending/draft curriculum reaches learners.

---

# 17. Dictionary Integration

After successful curriculum creation/update processing, vocabulary follows the existing Lexicon integration.

Only vocabulary items go through vocabulary dictionary matching.

Grammar items do not.

Existing confirmed mapping behavior and manual override rules remain authoritative.

Lambda must invoke existing domain services rather than implement dictionary matching internally.

Dictionary work that forms part of the confirmed import must follow the existing transaction/domain guarantees.

---

# 18. Import Status Model

Processing states:

```text
UPLOADING

QUEUED_FOR_PREVIEW

PREVIEWING

NEEDS_REVIEW

READY_TO_IMPORT

QUEUED_FOR_IMPORT

IMPORTING

COMPLETED

FAILED
```

Archival is separate from processing status.

Use:

```text
archived_at
archived_by
```

instead of turning `ARCHIVED` into a processing state.

This preserves the fact that an archived import may originally have been:

```text
COMPLETED
FAILED
NEEDS_REVIEW
```

---

# 19. Import History

Create:

```text
/admin/curriculum/imports
```

Normal history shows non-archived imports.

Example:

```text
Curriculum Imports

Spanish Level 2
spanish-level-2.csv
Completed
57 rows
43 created · 8 updated · 2 moved
Sep 10, 2026
[View]

Spanish Level 3
spanish-level-3.csv
Needs Review
61 rows · 2 need review
Sep 10, 2026
[Review]

Spanish Level 4
spanish-level-4.csv
Failed
Attempt 3/3
Sep 9, 2026
[View] [Retry]
```

An import details page must display:

- original filename;
- uploader;
- creation time;
- content checksum;
- environment;
- current status;
- total rows;
- create count;
- update count;
- move count;
- unchanged count;
- skipped count;
- review-required count;
- timestamps;
- retry count;
- final results;
- affected curriculum item IDs where relevant;
- safe failure information;
- development/production promotion relationship where applicable.

---

# 20. Proposed Database Model

Add `curriculum_imports`.

Conceptual fields:

```text
id
environment

original_filename
file_extension
s3_bucket
s3_key
source_sha256

uploaded_by_user_id

status

total_rows
create_count
update_count
move_count
unchanged_count
review_count
skipped_count

preview_version
confirmed_preview_version

attempt_count
last_error_code
last_error_summary

source_import_id

created_at
uploaded_at
preview_started_at
preview_completed_at
confirmed_at
import_started_at
completed_at

archived_at
archived_by_user_id
```

Exact schema naming should follow existing project conventions.

Add `curriculum_import_rows` or an equivalent persisted preview model.

Each preview row should retain only the information required to review and audit the import rather than duplicating the entire source CSV forever.

Conceptual fields:

```text
id
import_id
row_number

item_type
display_term

level_number
group_number

classification
previous_classification

resolved_learning_item_id

changed_fields

review_reason_code
review_reason

admin_disposition

changed_since_preview

created_at
updated_at
```

Large raw CSV payloads must not be stored permanently in PostgreSQL.

S3 remains the temporary source-of-file store.

---

# 21. Checksums and Idempotency

Compute SHA-256 for every source artifact.

The checksum identifies the exact source content but does not uniquely identify an import.

Uploading the exact same CSV twice is allowed.

Example:

```text
Import A
sha256 = ABC123

Import B
sha256 = ABC123
```

Both may exist.

This is required because re-importing a corrected/current curriculum artifact is a legitimate workflow.

AWS retry idempotency is instead based on the logical import operation.

Example keys:

```text
curriculum-import:{importId}:preview:v1

curriculum-import:{importId}:commit:v1
```

Receiving the same SQS message multiple times must never duplicate curriculum writes.

---

# 22. Retry Behavior

Transient worker failures automatically retry.

Configured behavior:

```text
Attempt 1
   ↓ failure
Attempt 2
   ↓ failure
Attempt 3
   ↓ failure
Dead-Letter Queue
```

After final failure:

```text
Import status = FAILED
```

Admin sees:

```text
Import failed after 3 attempts.

[Retry Import]
```

Manual retry creates a new processing attempt for the same logical import.

It does not create another curriculum import record.

Idempotency rules still apply.

---

# 23. Dead-Letter Queue

Create a dedicated SQS dead-letter queue for curriculum imports.

Its only purpose is to retain jobs that cannot complete after the configured retries.

No Lambda should continuously retry poison messages forever.

Dead-letter data must contain identifiers, not the curriculum CSV itself.

The source remains in S3 while available.

---

# 24. Source File Retention

Source CSV/TSV objects stay in S3 for:

```text
30 days
```

Use an S3 lifecycle expiration rule.

After expiration:

```text
S3 source file → deleted
Import history → retained
Audit history → retained
```

Import history must therefore remain understandable without the raw file.

If an import is permanently deleted before the 30-day expiration, its source S3 object must also be deleted immediately.

---

# 25. Archive

Normal import history provides:

```text
[Archive]
```

Archiving:

- removes the import from normal history;
- sets `archived_at`;
- records `archived_by`;
- does not change curriculum;
- does not delete the S3 source early;
- does not delete audit history;
- is reversible if an Unarchive control is implemented.

Provide:

```text
/admin/curriculum/imports/archived
```

for archived records.

---

# 26. Permanent Deletion

Only archived imports may be permanently deleted.

Permanent deletion requires a strong confirmation from the same authenticated Admin.

A second Admin is not required.

The confirmation must clearly state that import-history details will be permanently removed.

Use a deliberate confirmation such as:

```text
Permanently delete import?

This removes the import record, stored row results,
and remaining source file.

This does not undo curriculum changes made by the import.

Type DELETE to continue:

[          ]

[Cancel] [Permanently Delete]
```

Permanent deletion:

```text
delete import preview rows
delete import record
delete remaining S3 object
```

It must **not** delete curriculum items created or changed by that import.

Deletion is history cleanup, not an undo operation.

A minimal immutable Admin audit event must remain recording:

```text
import ID
checksum
deleted by
deleted at
original completion/failure state
```

The audit tombstone must not retain the full deleted CSV or deleted row preview.

---

# 27. No Import Undo

Version 1 does not provide:

```text
Undo Import
Rollback Import
Restore database to before import
```

An import may have modified records containing learner progress or later Admin changes.

Automatic historical rollback is therefore out of scope.

Corrections use the existing re-import/update system or Admin editing.

---

# 28. Development and Production Isolation

Development and production must use separate infrastructure.

Example:

```text
DEVELOPMENT

polyglot-dev-imports
polyglot-dev-import-queue
polyglot-dev-import-dlq
polyglot-dev-curriculum-import
        ↓
Neon Development
```

```text
PRODUCTION

polyglot-prod-imports
polyglot-prod-import-queue
polyglot-prod-import-dlq
polyglot-prod-curriculum-import
        ↓
Neon Production
```

A development Lambda must never receive production database credentials.

A production Lambda must never receive development database credentials.

The environments may share source code, Terraform modules, and configuration structure, but not runtime data or credentials.

---

# 29. Development → Production Promotion

The curriculum artifact, not the development database result, is promoted.

After a development import completes successfully, Admin may eventually see:

```text
Development Import Complete

spanish-level-2.csv
SHA-256: ABC123...

[Promote to Production]
```

Production receives the exact source artifact/checksum.

Production creates its own independent import record referencing:

```text
source_import_id
source_sha256
```

Production must independently run:

```text
Preview
   ↓
Review
   ↓
Admin confirmation
   ↓
Commit
```

Development approval does not authorize production mutation.

Example:

```text
Same CSV

DEV:
comer → UPDATE

PROD:
comer → CREATE
```

is valid if environment state differs.

Production always trusts its own current database.

If the development source object has already expired after 30 days, promotion cannot automatically copy it. Admin must re-upload the original artifact.

The checksum must match the previously approved development checksum if it is being presented as the same promoted artifact.

Production promotion controls may remain hidden until a production environment is actually configured.

The schema should support promotion lineage from day one.

---

# 30. Lambda Structure

Prefer one curriculum-import Lambda worker with explicit job types rather than duplicated functions.

Conceptual structure:

```text
aws/
  lambda/
    curriculum-import/
      handler.ts
      job-schema.ts
      preview-job.ts
      commit-job.ts
      db.ts
```

The handler should remain thin:

```text
SQS event
   ↓
validate message
   ↓
determine job type
   ↓
call application/domain service
```

Business logic remains in existing Polyglot domains.

Do not move curriculum business rules into `aws/`.

---

# 31. Lambda-Safe Database Binding

Existing domain services that accept an injected `DbClient` should be reused.

Lambda must create its own environment-safe database binding for Neon.

Do not depend on a Next.js-only `server-only` module if doing so prevents the worker from running independently.

Expected shape:

```text
Lambda
   ↓
Lambda-safe Neon/Drizzle client
   ↓
DbClient-injectable Polyglot services
```

This should follow the same principle already used by Polyglot CLI import scripts that need to execute outside the Next.js server runtime.

---

# 32. Networking

Lambda should access Neon over its normal external connection.

Do not place this worker in a custom VPC merely to access Neon.

Do not create:

```text
NAT Gateway
```

for this feature.

No EC2 instance, ECS service, always-running worker, or NAT Gateway is required.

---

# 33. IAM — Lambda Worker

Use a custom least-privilege IAM execution role.

The worker receives only the permissions required to process imports.

Expected AWS permissions include the minimum required subset of:

```text
SQS
- ReceiveMessage
- DeleteMessage
- GetQueueAttributes
- ChangeMessageVisibility if required

S3
- GetObject for Polyglot import objects
- DeleteObject only where worker behavior requires it
```

Resource permissions must be scoped to the Polyglot environment's actual queue/bucket ARNs.

Do not use:

```text
Resource: "*"
```

when a specific Polyglot resource ARN can be used.

Lambda must not be able to:

```text
manage IAM
create infrastructure
access unrelated buckets
access production resources from development
access unrelated queues
```

---

# 34. Zero-Cost Logging Policy

The default design does **not** use CloudWatch Logs as Polyglot import history.

Do not write:

```text
console.log(row)
console.log(csv)
console.log(import)
```

Do not log:

- CSV contents;
- individual curriculum rows;
- definitions;
- translations;
- imported words;
- database results;
- normal successful operations.

Import status, history, errors, and retries belong in Neon.

The Lambda execution role should use a custom IAM policy rather than blindly attaching AWS managed Lambda policies that grant CloudWatch Logs write permissions.

For the zero-cost-first configuration, do not grant:

```text
logs:CreateLogGroup
logs:CreateLogStream
logs:PutLogEvents
```

unless explicitly enabled later.

Controlled failures should be persisted as sanitized fields such as:

```text
last_error_code
last_error_summary
attempt_count
```

Do not persist complete stack traces in the production database.

Development debugging should use local tests and direct invocation whenever possible.

Temporary CloudWatch error logging may be introduced later only as an explicit infrastructure decision.

---

# 35. Failure Persistence Without Logs

Expected errors should be handled explicitly.

Example:

```text
try:
    process import
catch known error:
    save safe failure status in Neon
    throw so SQS can retry
```

Persist:

```text
IMPORT_DATABASE_UNAVAILABLE
IMPORT_SOURCE_NOT_FOUND
IMPORT_PARSE_FAILED
IMPORT_TRANSACTION_FAILED
IMPORT_STATE_CHANGED
```

plus a short safe description.

If Neon itself is unavailable and failure state cannot be persisted, SQS retry/DLQ behavior remains the external safety mechanism.

The Admin interface may identify a job as stale when it has remained in an active processing state beyond an expected threshold and offer retry/recovery handling.

---

# 36. Cost Guardrails

The architecture is deliberately bounded.

Initial worker configuration should use modest resources, then be adjusted only if real import testing requires it.

Starting target:

```text
Memory:               512 MB
Lambda batch size:    1 job
Reserved concurrency: 1
File maximum:         5 MB
Row maximum:          5,000
S3 retention:         30 days
```

No provisioned concurrency.

No Lambda Managed Instances.

No NAT Gateway.

No EC2.

No paid tracing.

No X-Ray requirement.

No import-content CloudWatch logging.

No third-party paid queue/worker provider.

Reserved concurrency of one is acceptable because curriculum imports are Admin-only background work and do not need high throughput.

The queue provides buffering if multiple jobs are requested.

---

# 37. SQS Configuration

Use a Standard SQS queue unless a concrete ordering requirement later proves FIFO necessary.

Each message represents one preview or commit operation.

Configure:

```text
batch size = 1
max receive count = 3
DLQ enabled
```

The SQS visibility timeout must safely exceed the Lambda execution timeout according to AWS Lambda/SQS requirements.

Do not implement a custom polling worker.

Lambda's SQS event-source integration owns message delivery.

---

# 38. Application UI Polling

After upload, the browser should not hold a request open waiting for Lambda.

Instead:

```text
Upload complete
      ↓
Admin page polls import status
      ↓
QUEUED_FOR_PREVIEW
      ↓
PREVIEWING
      ↓
READY / NEEDS_REVIEW
```

Use modest polling such as several seconds between status checks.

Stop polling on terminal/user-action states:

```text
NEEDS_REVIEW
READY_TO_IMPORT
COMPLETED
FAILED
```

Do not poll continuously after the Admin leaves the page.

No WebSocket infrastructure is required for Version 1.

---

# 39. Import UI States

Example processing UI:

```text
Spanish Level 2

Uploading curriculum...
```

then:

```text
Validating curriculum...

The import is running in the background.
You may leave this page.
```

then:

```text
Ready for Review

57 rows

42 Create
8 Update
3 Move
3 Unchanged
1 Needs Review

[Review Import]
```

After Admin resolves all flagged rows:

```text
Ready to Import

56 rows approved
1 row skipped

[Confirm Import]
```

During commit:

```text
Importing...

Applying 56 approved curriculum rows.
```

Completion:

```text
Import Complete

32 Created
16 Updated
3 Moved
5 Unchanged
1 Skipped

All newly created content is Pending.

[View Curriculum]
[View Import]
```

---

# 40. Archive UI

Normal history:

```text
[View] [...]
          └── Archive
```

Archived page:

```text
Archived Imports

[View]
[Restore to History]
[Permanently Delete]
```

Permanent deletion requires the strong confirmation defined earlier.

---

# 41. Infrastructure as Code

AWS resources for this feature should be defined using Terraform rather than relying on undocumented console configuration.

Terraform should own:

```text
S3 import bucket
S3 lifecycle rule
S3 → SQS notification
SQS import queue
SQS dead-letter queue
queue policies
Lambda function
SQS event-source mapping
Lambda IAM role
Lambda IAM policies
environment-specific variables
reserved concurrency
timeouts
```

Development and production should instantiate the same Terraform module with different environment configuration.

Secrets themselves must not be committed to Terraform source.

---

# 42. Environment Variables / Secrets

Lambda requires only environment-specific runtime information required for its work.

Conceptually:

```text
POLYGLOT_ENV
DATABASE_URL
IMPORT_BUCKET
```

Avoid duplicating values Lambda can receive from the SQS/S3 event or infrastructure configuration.

AWS credentials are supplied through the Lambda execution role, never environment variables.

No secret AWS access key may be embedded in Lambda source code.

---

# 43. Next.js Responsibilities After Migration

After this spec is complete, Next.js remains responsible for:

```text
Admin authentication
Admin authorization

import creation
presigned upload creation

status reads
preview presentation
review decisions

confirm-import action
retry action

history
archive
permanent delete

development → production promotion
```

Next.js no longer performs:

```text
full CSV parsing during upload request
bulk curriculum resolution during upload request
bulk curriculum mutation during confirmation request
dictionary batch work during confirmation request
```

Those operations execute through Lambda.

---

# 44. Removal of Old Execution Path

Do not leave two working importer execution paths after the Lambda system is verified.

Once Lambda preview and commit pass verification:

```text
remove old direct Server Action execution
```

while retaining any shared functions it previously called.

This is important:

```text
DELETE:
Next.js-specific execution path

KEEP:
parser
validators
resolution
bulk import services
repositories
domain logic
tests
```

There must be one production-authoritative path for asynchronous Admin imports.

CLI tooling may remain where it serves a separate explicit developer/maintenance purpose, but it must continue to reuse the same domain behavior.

---

# 45. Security Requirements

The implementation must ensure:

- only Admin can initiate any import mutation;
- S3 bucket is not public;
- public ACLs are disabled;
- upload URLs expire;
- S3 keys use generated import IDs;
- filename is metadata, not trusted path input;
- Lambda IAM is least privilege;
- development cannot access production resources;
- SQS messages contain IDs, not full curriculum content;
- commit always revalidates against current database state;
- arbitrary client preview data is never trusted;
- raw AWS credentials never reach the browser;
- import deletion does not delete curriculum;
- publication remains a separate Admin action.

---

# 46. Testing Requirements

## Unit tests

Cover:

- Lambda job message parsing;
- unsupported job types;
- import state transitions;
- stale preview comparison;
- material-change detection;
- review-disposition rules;
- inability to confirm unresolved rows;
- checksum behavior;
- idempotency-key generation;
- archive/delete guards.

Existing parser/resolver tests remain authoritative for curriculum behavior.

## Integration tests

Against the development Neon database, verify:

```text
preview writes no curriculum
commit creates valid rows
commit updates existing rows
commit moves existing rows
unchanged remains unchanged
manual overrides survive
item identity survives re-import
grammar stays out of Lexicon matching
new items remain Pending
published updates follow draft rules
commit rollback is atomic
same commit job twice mutates once
changed DB state returns to NEEDS_REVIEW
failed import can retry
archive changes history only
permanent import deletion leaves curriculum intact
```

## AWS integration tests

Verify real development infrastructure:

```text
S3 upload
   ↓
SQS event
   ↓
Lambda
   ↓
Neon preview
```

and:

```text
Admin Confirm
   ↓
SQS
   ↓
Lambda
   ↓
Neon commit
```

Verify duplicate SQS delivery produces no duplicate mutations.

Verify failed messages eventually reach the DLQ.

## Browser verification

Using localhost against development AWS/Neon:

```text
Upload
Preview processing
Review
Explicit skip
Confirm
Commit processing
Completion
History
Archive
Permanent deletion
```

Do not run browser tests that modify the shared development database concurrently with integration tests using that same database.

---

# 47. Local Development

The Polyglot application does **not** need to be deployed to Vercel before this feature can be implemented.

Supported development architecture:

```text
localhost:3000
      |
      v
Development AWS
      |
      ├── S3
      ├── SQS
      └── Lambda
             |
             v
         Neon DEV
```

The AWS development infrastructure itself must be deployed before end-to-end AWS testing.

The Next.js application may remain completely local.

---

# 48. Migration Sequence

Recommended implementation sequence:

```text
1. Add import-history schema.

2. Extract/confirm reusable importer boundaries.

3. Add import state-machine/domain behavior.

4. Add S3 upload orchestration.

5. Define Terraform S3 resources.

6. Define Terraform SQS + DLQ.

7. Define custom IAM policies.

8. Build Lambda-safe Neon binding.

9. Build thin Lambda handler.

10. Implement preview job.

11. Connect S3 → SQS → Lambda.

12. Replace current synchronous preview with async preview UI.

13. Implement Admin review persistence.

14. Implement confirmation → SQS.

15. Implement Lambda commit job.

16. Add stale-preview revalidation.

17. Add retries/failure state.

18. Add import history.

19. Add archive/permanent deletion.

20. Add 30-day S3 lifecycle cleanup.

21. Complete end-to-end development verification.

22. Remove old direct web execution path.

23. Add production infrastructure when production exists.

24. Enable artifact promotion when production is configured.
```

Do not remove the existing importer path until the new Lambda path has passed equivalence and end-to-end testing.

---

# 49. Out of Scope

Version 1 does not include:

- arbitrary spreadsheet editing;
- XLSX imports;
- user-facing imports;
- Writer imports;
- automatic curriculum publication;
- automatic rollback/undo;
- million-row data ingestion;
- WebSocket progress;
- Step Functions;
- ECS workers;
- EC2 workers;
- NAT Gateway;
- paid monitoring;
- X-Ray;
- permanent raw CSV storage;
- automatic production import without Admin confirmation;
- second-Admin approval for deletion.

---

# 50. Acceptance Criteria

Spec 19 is complete when an authenticated Admin can upload a valid curriculum CSV/TSV from the Polyglot Admin UI, leave the page while AWS performs preview processing, return to a persisted preview, review every problematic row explicitly, confirm the import, and have Lambda atomically execute the existing Polyglot curriculum-import logic against Neon.

The implementation is successful only if:

```text
Upload does not mutate curriculum.

Preview runs asynchronously in Lambda.

Commit runs asynchronously in Lambda.

Existing importer behavior is reused.

Every bad row requires explicit review.

Admin confirmation is mandatory.

Commit revalidates current database state.

Material changes return the import to review.

Selected mutations commit atomically.

Retries cannot duplicate curriculum changes.

New content stays Pending.

Only Admin can perform imports.

History persists.

Imports can be archived.

Archived history can be permanently deleted after confirmation.

Permanent history deletion never deletes curriculum.

S3 sources expire after 30 days.

Development and production infrastructure are isolated.

The same artifact can later be independently promoted and reviewed in production.

No import-content logging is required.

The design avoids paid always-running infrastructure.
```

# 51. Cost Principle

This feature must be implemented as a low-volume, Admin-only serverless workflow designed to operate inside AWS free usage allowances at Polyglot's expected scale.

Cost reduction must never weaken:

```text
authentication
authorization
transaction safety
idempotency
environment isolation
Admin confirmation
```

Observability is intentionally implemented primarily through Polyglot's own persisted import state rather than paid log ingestion.

If production scale later requires additional observability, logging/tracing can be introduced as a separate explicit infrastructure decision rather than being silently added by this feature.
