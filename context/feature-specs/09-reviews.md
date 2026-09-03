# Spec 09 — Reviews

## 1. Goal

Implement the production SRS review experience for learned vocabulary and grammar.

The review system must:

* load real due reviews from PostgreSQL
* use the user's active language
* test the configured required question types for each learning item
* reuse the existing answer-checking system
* apply SRS advancement or penalties only after a full item's required review questions are complete
* save each completed item immediately and atomically
* protect against duplicate, stale, concurrent, and replayed submissions
* record enough review outcome history for statistics and future leech detection
* present the distraction-free review UI defined in `ui-context.md`

The authoritative review path must use the real `curriculum`, `progress`, and `srs` domains. Fixture curriculum/progress must not be used for production review decisions.

---

## 2. Prerequisites

| Requirement                        | Status                       |
| ---------------------------------- | ---------------------------- |
| Neon + Drizzle database            | Done                         |
| `user_item_progress`               | Done                         |
| Real curriculum repositories       | Done                         |
| Real progress repositories         | Done                         |
| SRS stage definitions/order        | Done                         |
| Standard review intervals          | Done                         |
| Level 1–2 accelerated intervals    | Done                         |
| `calculateNextReview()`            | Done                         |
| `isReviewDue()`                    | Done                         |
| Shared `lib/answer-checking/`      | Done                         |
| Idempotency foundation             | Done                         |
| Rate-limit provider                | Done                         |
| Review-specific rate-limit policy  | Required here                |
| Atomic review completion mutation  | Required here                |
| Review history/outcome persistence | Required here                |
| `/reviews` route/UI                | Required here                |
| Real lesson → SRS enrollment       | Spec 07 unit 6 still pending |

Spec 07 unit 6 is **not required to build and test the review system against seeded progress**, but it is required before the full production flow of:

`lesson → enrollment → wait → review`

can be verified end to end.

---

## 3. Scope

### In scope

Normal scheduled reviews for official curriculum vocabulary and grammar:

`due review → question(s) → feedback → completed item → SRS mutation → next review`

This spec includes:

* due-review query
* review queue construction
* all currently due reviews by default
* vocabulary review questions
* configured grammar review question types
* answer checking
* incorrect-question retry behavior
* SRS advancement
* SRS penalties
* minimum-stage enforcement
* next-review scheduling
* Fluent completion
* atomic per-item persistence
* stale/concurrent review protection
* idempotency
* review rate limiting
* review outcome/history storage
* permanent level unlocks triggered by review progress
* review session statistics
* empty/loading/error/completion states
* desktop and mobile review UI

### Out of scope

Do not include:

* leech-review practice UI
* final leech classification thresholds
* early reviews
* free study
* deck reviews
* custom review filtering
* configurable session-size settings
* XP/rank/streak implementation
* real dashboard aggregation
* dashboard graph rewrites
* practice progression
* test progression

The database should capture the review outcomes needed for future leech detection, but actual leech classification remains deferred until its configurable thresholds are finalized.

---

## 4. Route and Authentication

Route:

`/reviews`

Protect:

`/reviews(.*)`

using the existing Clerk route-protection pattern.

Reviews should live inside the existing `(focus)` route group alongside lessons.

During an active review session:

* do not render the normal desktop application header
* do not render the mobile application bottom navigation
* provide an explicit Exit control
* keep the learner focused on the current review

The route always resolves the authenticated internal Polyglot user and that user's active language server-side.

A client may never provide a trusted `userId` or `languageId` for review authorization.

---

## 5. Review Eligibility

Server time is authoritative.

An item is due only when:

```text
current_server_time >= next_review_at
```

The browser clock must never decide whether an item is reviewable. Persisted timestamps remain UTC.

A due-review query must filter by:

```text
user_id
active language_id
next_review_at <= authoritative now
```

Only existing `user_item_progress` rows are eligible; a progress row means the item has already entered SRS.

Fluent items with no scheduled next review are not normal due reviews.

### Session size

For v1, include **all reviews that are due when the session begins**.

Do not hardcode an arbitrary limit such as 50.

A future setting may allow the learner to limit or customize review batches, but that is outside this spec.

The existing `(user_id, language_id, next_review_at)` indexing strategy should back this hot-path query.

---

## 6. Review Session Model

The overall review session is ephemeral.

Completed review **items** persist immediately, but unfinished session state does not need its own permanent database session record.

Use a server-signed review-state token, following the security pattern already established for lessons.

The signed state may contain information such as:

```text
user
language
queue
current question
session seed/order
server-graded question results
failed required directions/types
expected SRS stage
expected next_review_at
session statistics
expiration
```

The token is integrity protection, not authoritative SRS storage.

The server must still reload the real progress row before completing an item.

Do not place authoritative review state in:

* `localStorage`
* `sessionStorage`
* browser cookies
* client-provided SRS fields

Refreshing or abandoning the session may discard unfinished in-memory review state.

This is intentional:

* already completed items remain saved
* an item with only part of its required review complete remains due
* that item's SRS stage is unchanged

This is required by the existing atomic-review architecture.

Use a dedicated `REVIEW_STATE_SECRET` rather than exposing server state or reusing client-trusted values.

Keep the existing server/client barrel split:

```text
domains/srs/index.ts
```

must remain safe for client-safe exports, while database/auth/secret-dependent review orchestration belongs behind:

```text
domains/srs/server.ts
```

or another explicitly server-only entry point.

---

## 7. Review Question Requirements

### Vocabulary

Normal vocabulary reviews require both:

```text
target language → English
English → target language
```

An item is not complete until both required directions have been answered correctly.

The two directions for the same item should not normally appear consecutively when other unresolved questions are available.

### Grammar

Grammar uses the item's **configured grammar question types**.

Do not assume every grammar point is simple bidirectional translation.

A grammar item may therefore use whatever supported format its curriculum configuration declares.

If the item has multiple required configured question types, all required types must complete before the item reaches the atomic SRS mutation boundary.

### Answer checking

Reuse:

```text
lib/answer-checking/
```

Do not build a second review-specific answer-normalization implementation.

The existing answer checker already handles the shared behaviors intentionally prepared for reviews, including preserving meaningful diacritics, minor typo tolerance where allowed, and specific missing-article feedback.

Review answer candidates should be derived server-side from applicable curriculum/learner data, including:

* official accepted answers
* accepted variations
* accepted synonyms
* applicable user-created synonyms
* article requirements where applicable

The client sends the typed response.

The server decides correctness.

Never accept a client-provided:

```text
isCorrect
stage
penalty
nextReviewAt
```

Empty submissions do nothing.

---

## 8. Incorrect Answers and Retry Queue

An incorrect required question does **not** immediately complete the item's SRS mutation.

Instead:

1. mark that required direction/question type as having been answered incorrectly during this item review
2. provide incorrect feedback
3. reinsert the unresolved question later in the review queue
4. require the learner to eventually answer it correctly
5. retain the earlier incorrect result for SRS penalty calculation

Do not immediately repeat an incorrect question while other unresolved questions are available.

Repeated failures of the same required direction should not create an unlimited penalty multiplier. Penalty accounting should be based on the item's configured incorrect-adjustment rules rather than blindly counting every retry attempt.

The exact retry spacing remains centralized review configuration rather than UI logic.

---

## 9. SRS Result Calculation

SRS calculations belong entirely to `domains/srs`.

They must remain deterministic, pure where possible, and receive an explicit authoritative `now`.

### All required questions correct without an error

Advance the item one stage:

```text
Beginner 1
→ Beginner 2
→ Beginner 3
→ Beginner 4
→ Familiar 1
→ Familiar 2
→ Intermediate
→ Master
→ Fluent
```

Schedule the next review from the **resulting stage**, curriculum level, and centralized SRS configuration.

Levels 1 and 2 continue using the accelerated early-stage schedule already implemented in `domains/srs`.

Reaching Fluent:

* sets the item to Fluent
* records `fluent_at` when first reached
* ends the normal scheduled review cycle
* does not prevent supplemental practice

### Incorrect-answer penalty

Carry forward the approved minimum:

```text
minimum stage = Beginner 1
```

For Beginner 1–4:

```text
any incorrect required direction
→ penalty of exactly 1 stage
```

Even if both vocabulary directions were incorrect, the Beginner penalty remains one stage.

Examples:

```text
Beginner 1 + incorrect → Beginner 1
Beginner 2 + incorrect → Beginner 1
Beginner 4 + incorrect → Beginner 3
```

For Familiar 1 and above, use the configured penalty-factor algorithm rather than a special UI rule:

```text
new_stage =
  current_stage
  - (incorrect_adjustment_count * penalty_factor)
```

with:

```text
penalty_factor = 2
minimum = Beginner 1
```

`incorrect_adjustment_count` must be calculated by SRS domain logic from the completed item's required review results.

**Confirmation required:** see Open Question #1 for whether this means the factor applies once per distinct failed required direction or a maximum two-stage penalty per item.

If an item had any incorrect required answer during the current review item, it does not also advance before applying the penalty.

---

## 10. Atomic Review Completion

The transaction boundary is **one fully completed review item**, not the entire session.

When the last required question for an item is successfully completed, perform one authoritative operation.

The operation must:

```text
authenticate user
→ enforce review-submit rate limit
→ validate idempotency key
→ begin database transaction
→ lock/reload user_item_progress
→ validate ownership + language
→ validate review is still due
→ validate expected stage/review snapshot is still current
→ calculate SRS result
→ calculate next_review_at
→ update user_item_progress
→ append review outcome/history
→ evaluate applicable level unlock
→ persist newly earned level unlock if required
→ persist idempotency success/result
→ commit
```

Either all authoritative changes for the item commit or none do.

Database/repository code belongs at the repository/application boundary; React components and Server Actions must never perform ad hoc Drizzle mutations.

---

## 11. Concurrent and Stale Review Protection

Two browser tabs/devices may open the same due item.

Only one completion may advance or penalize that due review.

Use database-level row locking or equivalent safe concurrency protection during completion.

Inside the transaction, re-read the current authoritative progress.

Compare it against the server-created review snapshot.

If another completion already changed the item:

```text
do not mutate progress again
return STALE_REVIEW or REVIEW_NOT_DUE
```

The second submission must never advance the same review twice.

In the UI, explain that the review was already updated elsewhere and that no additional progress change was applied.

The learner may continue with the remaining session queue.

---

## 12. Idempotency

Every completed review-item mutation accepts a client-generated UUID idempotency key.

Generate one stable key for that logical item-completion operation and reuse the same key on network retries.

Wrap the authoritative completion through the existing:

```text
withIdempotency(...)
```

foundation.

Use a distinct operation name such as:

```text
review-complete
```

A replay with the same key and same payload returns the previously stored result without applying the SRS mutation again.

A replay with the same key but different payload returns a conflict.

Do not implement idempotency through:

```text
check if exists
then insert
```

The existing unique-constraint-backed mechanism is authoritative.

---

## 13. Rate Limiting

Add a review policy to:

```text
providers/rate-limit/policies.ts
```

such as:

```text
review-submit
```

Do not hardcode limit numbers inside the action or SRS service.

Every authoritative review submission goes through the provider interface.

Review progress mutations fail closed if the rate-limit provider is unavailable.

Return the existing structured:

```text
RATE_LIMITED
```

error with retry information where applicable.

---

## 14. Review Outcome / History Persistence

The current database foundation does not yet provide durable review-event history.

Add an additive migration for a review outcome/history table, for example:

```text
review_events
```

Suggested responsibilities:

```text
id
user_id
language_id
learning_item_id
reviewed_at
stage_before
stage_after
required_question_count
incorrect_adjustment_count
result
```

`result` should represent a small stable domain value such as:

```text
advanced
penalized
```

Do **not** store:

* raw typed answers
* every keystroke
* sensitive answer payloads
* a complete immutable answer-by-answer transcript

Architecture requires aggregate/statistical review information, but explicitly does not require storing an immutable typed-answer history.

Required indexes should support at least:

```text
(user_id, language_id, reviewed_at DESC, id DESC)
```

for review history, and:

```text
(user_id, learning_item_id, reviewed_at DESC)
```

for future leech-window calculations.

Review history endpoints/read services must use keyset pagination rather than an unbounded result set.

Do not add redundant aggregate columns to `user_item_progress` unless they are actually required by the approved read model.

---

## 15. Level Unlock Evaluation

Review completion may cause enough items in a level to reach the progression threshold.

After the new SRS stage has been calculated, evaluate the existing level-unlock rule:

```text
unlock_ratio = 5 / 6
minimum_stage = Familiar 1
```

Use the actual configured number of SRS-gating items.

Do not hardcode:

```text
50
```

When the threshold is met for the first time:

* persist the next level's unlock state
* make the operation idempotent
* keep the level permanently unlocked afterward

If reviewed items later fall below Familiar 1, the earned level must remain unlocked.

The unlock write should occur as part of the completed-review transaction when applicable so review progress and newly earned progression cannot disagree.

---

## 16. Review UI

Follow `ui-context.md` exactly.

Reviews use the existing warm Polyglot design system and a distraction-free Bunpro-inspired layout.

Do **not** place a large card around the central review prompt.

### Desktop structure

```text
Exit               [ progress bar ]               Session stats


                          gato

                    [ answer input ]

               á  é  í  ó  ú  ü  ñ

                         Submit
```

Top-left:

`Exit`

Top-center:

`review progress`

Top-right:

* remaining items
* accuracy
* other compact information only when useful

### Input

Place the answer field immediately below the prompt.

Reuse the lesson-style underline-focused input interaction where practical.

Spanish review input provides the configured character helpers:

```text
á é í ó ú ü ñ
```

Character helpers must:

* support keyboard access
* support touch
* insert at the caret where practical
* preserve existing input
* remain visually secondary

Do not hardcode Spanish helpers into the generic answer component; resolve them from language configuration.

### Keyboard behavior

`Enter` remains the primary review hotkey.

First Enter:

```text
submit answer
```

After feedback appears, second Enter:

```text
advance
```

Do not require mouse interaction during the normal review loop.

Preserve input focus through network submission and feedback.

Do not temporarily `disabled` the answer input if doing so causes focus loss. Prefer `readOnly` while waiting/awaiting advancement, following the lesson regression already discovered and fixed.

---

## 17. Feedback

### Correct

Show:

* clear success state
* check/success indicator
* brief positive transition

Feedback must remain fast.

The next question must never wait for an animation to finish.

### Incorrect

Expand the feedback beneath the current interaction.

Show:

* that the answer was incorrect
* what the learner entered
* the expected answer
* relevant supporting item information
* a specific explanation when the answer checker can identify the issue

Examples include:

* missing required article
* wrong meaning
* spelling issue where relevant

Incorrect feedback should teach rather than simply display red styling.

Never communicate correctness using color alone.

---

## 18. Empty, Loading, Error, and Completion States

### No reviews due

This is a success state.

Show:

```text
No reviews due
```

and, when available:

```text
Next review: <time>
```

Provide a route back to the dashboard.

Do not render an empty card or error message.

The UI context explicitly defines zero reviews as a successful state.

### Loading

Use shape-matched skeletons only when data loading is long enough to warrant them.

Do not use a full-page spinner.

### Error

Errors must clearly state whether progress was saved.

This is especially important after a final answer triggers the atomic review mutation.

For example:

```text
We couldn't save this review. Your SRS progress was not changed. Try again.
```

versus:

```text
This review was already completed in another session. No additional progress change was made.
```

Never expose database errors, stack traces, or internal tokens.

### Session complete

When the initial review queue has no unresolved questions remaining, show a minimal completion view containing:

* reviews completed
* session accuracy
* return-to-dashboard action

Do not add a large new gamification/celebration system in this spec.

---

## 19. Error Model

Reuse existing structured errors where applicable:

```text
UNAUTHENTICATED
FORBIDDEN
ITEM_NOT_FOUND
REVIEW_NOT_DUE
STALE_REVIEW
RATE_LIMITED
```

Add review-state-specific structured errors only where necessary, for example:

```text
INVALID_REVIEW_STATE
EXPIRED_REVIEW_STATE
```

Do not throw arbitrary user-facing strings from the domain.

---

## 20. Privacy and Logging

Never persist or log the learner's raw typed review answers.

Do not send typed answers to:

* Sentry
* PostHog
* structured application logs

Logging may include safe metadata such as:

```text
correlationId
user subject/id
operation
item id
result category
duration
structured error code
```

but not answer content.

Instrument:

```text
due-review query duration
review-completion duration
```

The architecture's current performance targets are:

```text
due-review query p95:       < 100 ms
review submission p95:      < 300 ms
database queries/request:   < 10
```

These are measurement targets rather than reasons to prematurely complicate the architecture.

---

## 21. Suggested Code Organization

Do not create a new architectural `reviews` domain unless a later architecture decision requires it.

Reviews belong to the existing `srs` boundary, which already owns review availability, stage changes, penalties, scheduling, and atomic review completion.

Suggested additions:

```text
app/(focus)/reviews/
  page.tsx
  actions.ts

components/reviews/
  review-session-view.tsx
  review-question.tsx
  review-input.tsx
  review-feedback.tsx
  review-top-bar.tsx
  review-progress.tsx
  review-empty-state.tsx
  review-completion.tsx

domains/srs/
  review-types.ts
  review-schemas.ts
  review-config.ts
  review-queue.ts
  review-token.ts
  review-repository.ts
  review-service.ts
  review-completion.ts
  srs-rules.ts
  srs-config.ts
  index.ts
  server.ts

db/schema/
  reviews.ts

lib/answer-checking/
  existing shared implementation
```

File names are illustrative; preserve existing repository conventions when actual implementation makes another split cleaner.

---

## 22. Implementation Units

Implement this spec sequentially rather than in one large change.

### Unit 1 — Review SRS rules

Implement and verify:

* penalty calculation
* minimum Beginner 1 floor
* correct advancement
* Familiar+ penalty factor
* Fluent completion behavior
* review-specific configuration

No UI.

No database mutation.

### Unit 2 — Persistence and due-review query

Add:

* `review_events`
* migration
* indexes
* due-review repository query
* review history repository primitives

Verify against real PostgreSQL integration tests.

### Unit 3 — Review session and question orchestration

Implement:

* signed ephemeral state
* queue creation
* deterministic testable ordering
* vocabulary requirements
* configured grammar requirements
* shared answer checking
* incorrect retry behavior
* session statistics

No authoritative SRS mutation until the completion boundary is reached.

### Unit 4 — Atomic review completion

Implement:

* progress-row locking/revalidation
* stale protection
* SRS mutation
* next review calculation
* Fluent timestamp
* review event insertion
* level-unlock evaluation
* idempotency
* `review-submit` rate limiting

Verify rollback, replay, and true concurrent submission behavior against PostgreSQL.

### Unit 5 — `/reviews` UI

Build:

* protected route
* focus layout
* top bar
* review interaction
* accent controls
* keyboard flow
* feedback
* no-reviews state
* completion state
* error handling
* mobile layout
* reduced-motion support

### Unit 6 — End-to-end verification

Verify the complete review flow with Playwright and update `progress-tracker.md`.

Do not combine unrelated dashboard or practice work into this unit.

The project's workflow specifically requires large features to be split into small verifiable implementation units.

---

## 23. Required Tests

### Unit tests

Cover at minimum:

```text
exact due-time boundary
review not due early
standard intervals
Levels 1–2 accelerated intervals
all-correct advancement
Beginner incorrect penalty
Beginner floor at Beginner 1
Familiar+ incorrect penalty
both required directions incorrect
repeated incorrect retry behavior
Fluent completion
vocabulary question requirements
configured grammar question requirements
queue ordering
shared answer checking
missing article
accepted synonym
user synonym
diacritic preservation
```

Use fixed timestamps.

Review queue ordering must be deterministic/reproducible in tests.

### Integration tests

Against real PostgreSQL:

```text
due-review ownership and language filtering
completed item updates progress
review event persists
failed transaction changes nothing
completed item persists if session later exits
half-completed item changes nothing
same idempotency key produces one effect
same key + different payload conflicts
two-device concurrent completion applies once
stale completion is rejected
rate-limit failure blocks progress mutation
newly earned level persists
existing earned level does not relock after demotion
review history keyset pagination
```

### Component tests

Verify:

```text
no large review card
Enter submit → Enter advance
input focus survives submission
accent insertion
correct feedback
incorrect feedback
remaining count
progress state
zero-due state
error states state whether progress saved
```

### Browser verification

Desktop and mobile:

```text
signed-out /reviews redirects to sign-in
signed-in user sees only their active-language reviews
normal app navigation is hidden during session
keyboard-only flow works
incorrect question returns later
both directions complete one item
completed item remains saved after exiting
refresh leaves half-completed item due
real second Enter advances without requiring refocus
mobile has no horizontal overflow
reduced motion retains all functionality
```

Once Spec 07 unit 6 is complete, add the full:

```text
lesson
→ Beginner 1 enrollment
→ due-time review
→ review completion
→ new SRS stage
```

end-to-end test.

---

## 24. Completion Criteria

This spec is complete when:

1. `/reviews` uses real database-backed user progress.
2. Only server-confirmed due items enter a review session.
3. All currently due items are available in the session.
4. Vocabulary and configured grammar questions work.
5. Answer checking reuses `lib/answer-checking`.
6. Incorrect questions return later rather than immediately where possible.
7. SRS penalties and advancement are calculated only by `domains/srs`.
8. A half-completed item cannot modify SRS progress.
9. Each fully completed item saves independently and transactionally.
10. Duplicate/idempotent requests cannot apply progress twice.
11. Concurrent devices cannot complete the same due review twice.
12. Review history stores outcomes without storing raw typed answers.
13. Level unlocks caused by review advancement persist correctly.
14. Review submission is rate limited.
15. Zero reviews due has a proper success state.
16. Keyboard-only interaction works reliably.
17. Desktop/mobile/reduced-motion behavior is verified.
18. Typecheck, lint, unit tests, integration tests, and build all pass.
19. Relevant real-browser verification passes.
20. `progress-tracker.md` is updated in the same implementation task.
