# AI Workflow Rules

## Approach

Build Polyglot incrementally using a **spec-driven workflow**.

The context files define:

- what to build
- how the system is structured
- how code should be written
- how the UI should look
- what the current implementation state is

These files are the primary source of truth:

1. `project-overview.md`
2. `architecture.md`
3. `code-standards.md`
4. `ui-context.md`
5. `ai-workflow-rules.md`
6. `progress-tracker.md`

Claude must treat these files as authoritative and must not invent product behavior, architecture, or workflow rules that conflict with them.

Claude may make **normal implementation decisions** that are already implied by the context files.

Claude must **ask before making a new product or architecture decision** that is not already established by the context.

For anything beyond a trivial fix, Claude should begin by giving a short implementation plan before modifying code.

---

## Session Startup Procedure

At the start of a coding session, Claude should:

1. Read the context files in this order:
   - `project-overview.md`
   - `architecture.md`
   - `code-standards.md`
   - `ui-context.md`
   - `ai-workflow-rules.md`
   - `progress-tracker.md`
2. Identify the current goal and open questions from `progress-tracker.md`
3. Inspect only the code relevant to the requested task before making changes
4. Propose a short implementation plan when the task is more than trivial
5. Implement only the smallest complete unit that can be verified end to end

Claude should not rely on chat history alone when the context files and `progress-tracker.md` are available.

`progress-tracker.md` must be detailed enough that a fresh Claude session can resume work safely.

---

## Scoping Rules

- Work on one feature unit at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step.
- Keep each unit small enough that it can be understood, implemented, and verified without broad speculative refactors.
- If the user asks for a large feature, Claude should break it into smaller implementation units rather than attempting the full feature in one step.
- A "feature unit" should usually have one clear outcome, one dominant domain boundary, and one verifiable behavior.

Examples of good units:

- add language selection persistence
- implement review forecast read model
- implement lesson availability query
- add dashboard widget reordering persistence
- add admin CSV preview validation

Examples of overly broad units:

- implement the whole dashboard
- build lessons, reviews, and admin tools together
- add all Spanish learning flows in one change

---

## When to Split Work

Split an implementation step if it combines:

- UI changes and major domain-rule changes
- Multiple unrelated API routes or workflows
- Multiple unrelated domains
- A schema change plus several unrelated UI features
- Behavior that is not clearly defined in the context files
- Enough work that end-to-end verification becomes unclear or slow

If a task cannot be verified clearly at the end of the step, the scope is too broad and should be split.

If a request is broad, Claude should:

1. identify the most reasonable first unit
2. state the intended scope
3. complete only that unit cleanly
4. update `progress-tracker.md` with what remains next

---

## Planning Before Coding

For anything more than a trivial fix, Claude should provide a short plan before implementation.

The plan should usually include:

- the specific unit being implemented
- the files or domains likely to change
- whether a schema/migration change is needed
- how the result will be verified

The plan should be concise and practical rather than overly formal.

---

## Handling Missing Requirements

- Do not invent product behavior that is not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context file before implementing when possible.
- If a requirement is missing and the behavior is not safely implied by the existing context, add it as an open question in `progress-tracker.md` before continuing.
- If the missing requirement blocks the current task, pause and ask the user.
- If the missing requirement does not block the safe completion of the current unit, continue with the safe portion only and record the unresolved decision.

Claude may infer only **low-risk implementation details** that are already clearly supported by the current context.

Claude must not infer:

- new product rules
- new architecture boundaries
- hidden business logic
- unlock rules not documented anywhere
- new permissions or data ownership rules
- new curriculum behavior

---

## Architecture and Spec Authority

The source-of-truth files are authoritative over existing code when they conflict.

If existing code conflicts with:

- `project-overview.md`
- `architecture.md`
- `code-standards.md`
- `ui-context.md`

Claude should prefer the documented specification.

If correcting the conflict is within the current scope, Claude should refactor the conflicting implementation rather than preserving the bad pattern.

If correcting the conflict would substantially expand the requested work, Claude should:

1. avoid adding another workaround
2. record the issue in `progress-tracker.md`
3. complete only the work that can be done without violating the architecture or product spec

Never choose the easier workaround over a known architectural invariant.

---

## Existing Bugs Found During Unrelated Work

If Claude discovers an unrelated bug while working:

- Fix it immediately only if it is tiny and directly blocking the requested work.
- Otherwise, record it in `progress-tracker.md` and stay on scope.

Claude should not silently expand a task into a broad cleanup effort because unrelated issues were noticed.

---

## Database and Schema Changes

Additive or non-destructive schema changes that are clearly required by the approved feature may be made as part of normal implementation.

Examples:

- adding a new table
- adding a new nullable column
- adding an index
- adding a join table
- adding a new safe enum/value strategy

Destructive or high-risk data model changes require explicit approval first.

Examples:

- dropping tables or columns
- changing meanings of existing fields
- irreversible data migrations
- resetting user data
- major schema rewrites

Rules:

- All schema changes must use migrations.
- Do not manually alter schema as a substitute for migrations.
- Do not perform destructive data resets unless explicitly approved.
- If a migration is needed, include it in the implementation plan.
- Never edit a migration that has already been merged. Corrections are new migrations.
- Every migration must be safe against the previously deployed application version, since deployment and migration are not atomic.
- Renames, type changes, and column removals use expand-and-contract across separate deployments. The contract phase requires explicit approval.
- Review generated migrations before committing. Generators emit destructive statements without warning.
- State in the plan whether a migration is destructive, whether it requires a backfill, and whether it can run while the application is serving traffic.

---

## Dependency Changes

Claude may install a clearly justified dependency when necessary.

Rules:

- Prefer existing dependencies first.
- Avoid adding a dependency for trivial functionality.
- Choose dependencies that fit the current architecture and code standards.
- Major infrastructure or ecosystem shifts should still be surfaced clearly to the user.
- If a new dependency is added, explain why it was needed.
- Keep dependency changes tightly related to the current unit of work.

Examples of acceptable cases:

- a well-justified validation/helper library
- a test utility required for the new workflow
- a date/time utility needed for correct timezone handling

Examples of non-acceptable behavior:

- adding multiple unrelated packages opportunistically
- swapping major foundational libraries casually
- installing a package without explaining why

---

## Protected Files

Do not modify the following unless explicitly instructed or unless the change is clearly required and appropriate:

- `components/ui/*` generated shadcn primitives, unless a base-component change is genuinely needed
- generated build output
- `.next/*`
- dependency internals in `node_modules`
- previously applied migration files in shared/production history
- lockfiles unless dependencies actually changed
- third-party library internals

Routine implementation should usually avoid broad edits to generated or external files.

---

## Context File Modification Rules

### Files Claude May Update Routinely

Claude may update routinely:

- `progress-tracker.md`

### Files Claude May Update Carefully

Claude may update carefully when implementation reveals an already-approved change, or when the user explicitly asks to revise the spec:

- `project-overview.md`
- `architecture.md`
- `code-standards.md`
- `ui-context.md`
- `ai-workflow-rules.md`

Claude must not casually rewrite source-of-truth files during normal coding work.

If implementation reveals that one of those files is missing an already-decided fact, Claude may update it in the same task **only if** the update is a faithful documentation sync rather than a new decision.

---

## Keeping Docs in Sync

Update the relevant context documentation whenever implementation changes:

- system architecture or boundaries
- storage model decisions
- code conventions or standards
- feature scope
- known limitations
- current goal / next unit
- open questions
- implementation status

After every meaningful implementation change, Claude should update `progress-tracker.md` in the same task.

The tracker should include enough detail for another session to resume safely, including:

- what was completed
- what is still in progress
- what should happen next
- any unresolved questions
- any architecture decisions discovered during implementation
- any important session notes or caveats

Documentation should not be deferred “for later” after meaningful implementation work.

---

## Verification Rules

Before Claude says a meaningful implementation is complete, it must verify the work as fully as practical.

When relevant, verification should include:

1. type checking
2. linting
3. relevant unit/integration tests
4. `npm run build`
5. migration checks when the change touches the schema

Verification must match what CI will run. A unit is not verified because it works locally; it is verified when every check the pipeline enforces would pass. If a check cannot be run in the current environment, say which one and why rather than implying the whole set passed.

Claude must never state or imply that a check passed without running it. Reporting an unrun check as passing is worse than reporting it as skipped, because it removes the user's ability to catch the gap.

Claude should also verify the feature itself conceptually against the current spec:

- Does it match `project-overview.md`?
- Does it preserve `architecture.md` invariants?
- Does it follow `code-standards.md`?
- Does it align with `ui-context.md` for visual work?

If any verification step cannot be run, Claude must say so explicitly.

If a verification step fails, Claude must say so explicitly.

Claude must not claim a task is fully complete if required verification failed or was skipped.

---

## Handling Failed Verification

If tests, linting, type-checking, or build fail, Claude must distinguish between:

- failures caused by the current change
- pre-existing unrelated failures

Claude should report that distinction clearly.

If the failure appears pre-existing, Claude should say so and avoid pretending the current unit is fully verified.

If the failure was introduced by the current work, Claude should fix it before claiming completion, unless the user explicitly asks to stop earlier.

---

## Completion Standard

A meaningful implementation unit is not complete until all of the following are true:

1. The requested unit works end to end within its defined scope.
2. No invariant defined in `architecture.md` was violated.
3. Relevant code follows `code-standards.md`.
4. Relevant UI work follows `ui-context.md`.
5. Required verification steps were run, or their absence was explicitly reported.
6. `progress-tracker.md` reflects the completed work.
7. Any context-file changes required for spec synchronization have been made.
8. Every check the CI pipeline enforces would pass on this change.
9. Any schema change ships as a reviewed migration meeting the rules above.
10. Any progress-affecting mutation is idempotent, rate limited, and authorized server-side.
11. Frontend work handles loading, empty, error, and success states.

Claude should not mark work complete merely because code was written.

---

## Non-Functional Review

Before declaring a unit complete, check it against the operational concerns in `architecture.md`. Not every question applies to every unit, but each should be consciously dismissed rather than forgotten.

- **Authorization** — is every mutation authorized server-side, with ownership verified?
- **Validation** — is untrusted input validated at the boundary with a schema?
- **Idempotency** — can this mutation be safely replayed?
- **Rate limiting** — can this endpoint be abused by repetition?
- **Query cost** — is any new query paginated where unbounded and indexed where filtered?
- **Failure behavior** — what happens when the database, provider, or network fails partway through?
- **Observability** — would a failure here be diagnosable from logs, without exposing user content?
- **States** — does the interface handle loading, empty, error, and success?
- **Accessibility** — keyboard reachable, labelled, and usable under reduced motion?

These are not optional polish. A feature that works only on the happy path with one user is not finished.

---

## Infrastructure and Pipeline Changes

CI workflows, deployment configuration, and environment definitions are infrastructure. Treat them with more care than application code, because a mistake blocks every future change rather than one feature.

- Changes to workflow files, branch protection, or environment configuration must be stated explicitly in the plan and never bundled into an unrelated feature unit.
- Do not weaken, skip, or bypass a CI check to make a unit pass. If a check is wrong, fix the check deliberately as its own unit and explain why.
- Do not add a test retry to resolve a failure in domain logic. A flaky domain test indicates a real defect.
- New infrastructure dependencies — a cache, a queue, a rate-limit store, a monitoring service — are architecture decisions requiring approval, not routine dependency additions.
- Never commit credentials, connection strings, or tokens, including in workflow files, test fixtures, or example configuration.

---

## Git Behavior

Claude must not automatically commit or push changes unless explicitly instructed.

The user handles commits and pushes.

Claude may, when useful:

- summarize changed files
- summarize what was implemented
- suggest a Git commit message
- suggest a sequence of commits if the work is substantial

Claude should not assume authority to perform Git history operations without being asked.

---

## Response Style During Implementation

When working on implementation, Claude should usually communicate in this structure:

1. short plan
2. implementation summary
3. verification summary
4. documentation/tracker updates
5. suggested next step

Keep status communication concise but concrete.

Avoid long speculative explanations when the user is asking for implementation progress.

---

## AI Safety Rules for Product Logic

Claude must be especially careful with high-risk product logic, including:

- SRS stage transitions
- review scheduling
- review availability
- lesson completion
- level unlocks
- progress persistence
- access-tier enforcement
- curriculum identity and movement
- admin CSV imports
- reset operations

For these areas:

- do not improvise hidden rules
- do not bypass domain logic
- do not preserve broken legacy logic because it is convenient
- do not trust client-provided authoritative state
- verify carefully
- prefer explicit tests

---

## Before Moving to the Next Unit

Before moving to the next implementation unit, ensure:

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture.md` was violated.
3. `progress-tracker.md` reflects the completed work.
4. `npm run build` passes.
5. Relevant tests, linting, and type checks have been run when applicable.
6. Any blocked or unresolved items are recorded explicitly.
7. The non-functional review above has been considered.
8. No CI check was weakened, skipped, or bypassed to reach completion.

If those conditions are not satisfied, Claude should not casually proceed as though the work is done.

---

## Practical Default Workflow

For most normal tasks, Claude should follow this pattern:

1. Read the six context files.
2. Read relevant code only.
3. State the implementation unit.
4. State a short plan.
5. Implement the change.
6. Run verification.
7. Update `progress-tracker.md` and any required context docs.
8. Report what changed, how it was verified, and what should happen next.

This workflow is the default unless the user explicitly requests a different mode of work.
