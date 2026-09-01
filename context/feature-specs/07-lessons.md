# Spec 07 — Lesson Session Logic & UI

Read `AGENTS.md`, `context/project-overview.md`, `context/architecture.md`,
`context/code-standards.md`, `context/ui-context.md`,
`context/ai-workflow-rules.md`, and `context/progress-tracker.md` before starting.

Implement the standard Polyglot lesson experience.

This feature covers:

- lesson availability and batch loading
- lesson study flow
- Bunpro-inspired lesson layout
- lesson navigation and progress
- server-signed ephemeral lesson state
- comprehension quiz
- server-authoritative answer checking
- incorrect-answer retry scheduling
- successful lesson completion
- atomic enrollment of the entire lesson batch into Beginner 1

Do not implement the normal SRS review session in this spec.

Do not implement custom lesson selection in this spec.

Do not implement lesson recovery after refresh.

---

## Prerequisites

This spec cannot be completed end to end against the repository as it exists
today. Per `progress-tracker.md`, none of the following exists yet:

| Requirement | Needed by | Status |
| --- | --- | --- |
| Database layer (Drizzle + Neon) | §45, §46, §49, §61 | Not started |
| Internal user record / `users` domain | §10, §44 | Not started (Next Up #3) |
| `curriculum` domain and real curriculum data | §15, §16, §24, §29 | Not started (Next Up #4) |
| `srs` domain | §46, §47, §48 | Not started (Next Up #4) |
| `progress` domain | §44, §53 | Not started (Next Up #4) |
| Rate-limit provider | §50 | Not started; backing store is an open question |
| Idempotency key storage | §49 | Not started |
| Integration test harness | §79, §80 | Not started; harness choice is an open question |
| `media` / R2 storage | §15 pronunciation audio | Not started |

Units 1 through 5 and unit 7 in §90 can be implemented now against a
fixture-backed curriculum service, following the pattern established by the
spec 06 architecture decision (a real `async` domain service with a temporary
fixture implementation, swappable in one file).

Unit 6 — final revalidation, atomic SRS enrollment, idempotency, and rate
limiting — cannot begin until the database layer and the `users`, `curriculum`,
`srs`, and `progress` domains exist. Do not fake it. Do not stand up a
throwaway SRS implementation inside `domains/lessons/` to unblock this spec.

If unit 6 is blocked, complete units 1–5 and 7, record the block in
`progress-tracker.md`, and stop.

---

## Decisions To Confirm

The following were previously undefined and have been decided here. Confirm
them before implementation, since each is a product rule rather than an
implementation detail.

1. **Article direction** (§23). The article is required for English → Spanish
   only. Spanish → English expects the English meaning with no article.
2. **Initial question order** (§22). Deterministic interleave; an item's two
   directions are never adjacent.
3. **Quiz top bar** (§26). Lessons use the same compact top-right session
   context as the review interface in `ui-context.md`.
4. **Input placement** (§26). The prompt and answer line are centered as a
   group in the space above the bottom progress segments, rather than pinned to
   the bottom of the viewport as in the Bunpro reference, because the lesson
   quiz keeps its progress segments and the review screen has none.
5. **Duplicate enrollment** (§44). A batch containing an already-enrolled item
   fails as a whole with a structured error. No partial enrollment, no silent
   skip.
6. **Gamification** (§46, §89). Lesson completion awards no XP and touches no
   streak in this spec.

---

## Reference Material

The attached Bunpro **review** screenshot is the structural reference for the
quiz (§26).

The Bunpro **lesson study** screen — the one with the Details / Examples /
Resources tabs and the bottom item segments — is a different page and is not
yet attached. §11, §12, §14, and §17 describe it in prose. Attach that
screenshot before implementing unit 3, or implement from the prose description
only and do not guess at unstated details.

---

# 1. Route

Use:

`/lessons`

Lessons use a dedicated full-focus learning layout.

Do not display the normal authenticated application header or mobile bottom
navigation while a lesson is active.

The lesson provides its own:

- exit control
- lesson context
- progress navigation
- primary action

## Route Placement

`/lessons` must not live under `app/(app)/`. That route group's layout renders
`AppHeader` and `AppNavMobile`, which this section forbids.

Create a sibling authenticated route group for full-focus learning experiences
(for example `app/(focus)/lessons/`) with its own minimal layout. The review
session and practice modes will later share it.

## Route Protection

Add `/lessons` to the `createRouteMatcher` list in `proxy.ts`, per the spec 06
architecture decision that new authenticated routes join that matcher as they
ship.

Consider generalizing the matcher to cover the authenticated route groups
rather than enumerating individual paths, since this is the second protected
route.

---

# 2. Lesson Batch

A standard lesson starts with a server-selected batch of currently eligible
learning items.

Use the user's configured lesson batch size.

The default batch size is 6.

## Batch Size Configuration

User settings do not exist yet. Until they do, read the batch size from lesson
domain configuration with the default of 6, through a single accessor that the
future settings lookup can replace without touching call sites.

Do not read a literal `6` in more than one place.

Lesson eligibility and priority are authoritative server-side rules.

Lower unlocked curriculum levels take priority over higher unlocked levels.

The client must never be able to make an arbitrary item eligible simply by
submitting its ID.

A standard lesson batch may contain:

- vocabulary
- grammar

Future learning-item types should not require rewriting the core lesson-session
system.

The lesson domain owns:

- lesson availability
- lesson priority
- batch selection

---

# 3. Lesson Session Lifecycle

The standard lesson lifecycle is:

`select batch`
→ `study every item`
→ `start quiz`
→ `answer required questions`
→ `retry mistakes later`
→ `complete all requirements`
→ `atomically enter Beginner 1`
→ `show results`
→ `return to dashboard`

Viewing lesson material does not create SRS progress.

Starting the quiz does not create SRS progress.

Only successful completion of the entire lesson quiz may enroll the lesson
batch into SRS.

---

# 4. Ephemeral Lesson Sessions

Lessons are intentionally ephemeral.

Do not create a persisted unfinished lesson-session record in the database.

If the learner:

- refreshes the page
- navigates away
- closes the tab
- closes the browser
- explicitly exits the lesson

the unfinished lesson session is discarded.

The lesson must be restarted.

No partial lesson completion is saved.

No lesson item enters SRS.

The lesson items remain eligible for a future lesson if they are otherwise
still eligible.

Do not attempt to recover an unfinished lesson.

---

# 5. Stateless Server-Validated Lesson State

Polyglot does not persist unfinished lesson sessions in the database.

Instead, an active lesson uses a **server-signed ephemeral lesson-state token**.

The browser holds the token only for the lifetime of the active lesson page.

Do not intentionally store the token in:

- `localStorage`
- `sessionStorage`
- persistent cookies
- a lesson-session database table

Refreshing, navigating away, closing the browser, or exiting the lesson
therefore destroys the unfinished lesson session as required.

The browser may manage normal presentation state, but it must never be the
authority for:

- whether the quiz is complete
- whether an answer is correct
- whether a lesson item has earned Beginner 1
- whether SRS enrollment is allowed

---

# 6. Lesson State Flow

Conceptually:

    Start Lesson
         ↓
    Server selects eligible batch
         ↓
    Server creates signed lesson-state token
         ↓
    Client displays lesson
         ↓
    Learner studies items
         ↓
    Server updates signed ephemeral state
         ↓
    All items opened
         ↓
    Quiz begins
         ↓
    Each answer validated server-side
         ↓
    Server updates retry/completion state
         ↓
    All requirements satisfied
         ↓
    Completed signed lesson state
         ↓
    Final server revalidation
         ↓
    Atomic SRS enrollment
         ↓
    Entire batch enters Beginner 1

---

# 7. Lesson State Contents

The signed ephemeral lesson state may contain values such as:

- lesson session ID
- authenticated user ID
- language ID
- lesson item IDs
- lesson batch ordering
- viewed item IDs
- current phase
- required quiz question identifiers
- satisfied quiz requirement identifiers
- unresolved questions
- pending retry questions
- retry ordering / spacing state
- attempt counters needed for session statistics
- token issued timestamp
- token expiration timestamp

The current phase should use an explicit value such as:

- `study`
- `quiz`
- `complete`

Do not place authoritative correct answers or hidden answer data inside
client-readable state.

Do not place sensitive typed learner answers in the token unless genuinely
required.

The server loads authoritative curriculum data when validating answers.

## Transport

Send the token in the request body, not in a header or cookie. The state grows
with batch size and question count, and header size limits are a hosting-layer
concern this feature should not inherit.

## Observability

Per `architecture.md`, typed learner answers and journal content are never sent
to analytics or error monitoring.

Do not attach the lesson token, its decoded contents, or the learner's
submitted answer to Sentry breadcrumbs, PostHog events, or structured logs.
Log the lesson session ID and the structured error code only.

---

# 8. Lesson Token Integrity

The lesson-state token must be cryptographically signed by the server.

The client may return the token with subsequent lesson requests, but it may
not modify its contents.

A modified, malformed, expired, or user-mismatched token must be rejected.

The token must be bound to:

- authenticated user
- active language
- lesson session ID

A lesson token created for one user must never work for another user.

A lesson token created for one language must never affect progress in another
language.

Prefer existing platform/runtime cryptographic capabilities rather than adding
a dependency solely for token signing when practical. Web Crypto HMAC is
available in the Next.js runtime and is sufficient.

A signed token protects **integrity**, not secrecy.

Therefore, never place information in the token that would be unsafe for the
learner to read.

## Signing Secret

Add a `LESSON_STATE_SECRET` environment variable.

Validate it in `lib/env.ts` with the existing fail-fast Zod schema and document
it in `.env.example`, following the pattern established for the Clerk
variables in spec 04.

Rotating the secret invalidates every in-flight lesson. That is acceptable
given §4 — an invalidated lesson behaves exactly like an expired one — but the
behavior must be stated rather than discovered.

---

# 9. Lesson Token Expiration

Lesson-state tokens have a finite lifetime.

The exact expiration duration belongs in configuration.

Do not scatter an expiration literal throughout the codebase.

Expiration is a security boundary, not a recovery mechanism.

If the lesson token expires:

- reject further lesson actions using that token
- do not recover the unfinished session
- do not create partial progress
- require the learner to begin a new lesson

Do not automatically persist the state merely to prevent expiration.

---

# 10. Starting a Lesson

When the learner starts a standard lesson:

1. Authenticate the user.
2. Resolve the user's active language.
3. Resolve the configured lesson batch size.
4. Calculate currently eligible lesson items server-side.
5. Apply curriculum lesson priority.
6. Prefer lower unlocked curriculum levels.
7. Select the batch.
8. Generate a unique ephemeral lesson session ID.
9. Build the initial lesson-state payload.
10. Sign the lesson-state token.
11. Return the renderable lesson content and signed state.

The client does not choose authoritative eligibility.

Client-provided IDs are requests only and must never be treated as proof of
eligibility.

## Demo Mode

Demo lessons are out of scope for this spec — see §89.

Step 1 requires a real authenticated user. Do not add a demo branch, a
nullable user path, or a temporary anonymous session to accommodate the demo
experience. Demo lessons will need their own isolated session model per
`architecture.md`'s demo architecture, specified separately.

---

# 11. Lesson Study Layout

Use the Bunpro lesson screen as the primary **structural** reference. See
Reference Material above regarding the missing screenshot.

Do not copy Bunpro's visual identity.

Apply Polyglot's existing design system:

- Shantell Sans typography
- warm graph-paper background
- semantic color tokens
- vocabulary blue
- grammar red
- green primary actions
- existing card/border language where appropriate
- light mode
- dark mode
- reduced-motion behavior

The result should feel like:

**Polyglot using Bunpro's focused learning structure**

rather than a clone of Bunpro.

---

# 12. Desktop Lesson Structure

Conceptually:

    [exit]              Level 1 • Lesson • 2 / 6


                          aprender
                           to learn


                 Details | Examples | Resources


    ----------------------------------------------------

                       lesson content

    ----------------------------------------------------


    ====================================================

            ━━━   ━━━   ━━━   ━━━   ━━━   ━━━

                                                Next

    ====================================================

Keep the educational content centered and wide.

Do not place the entire lesson inside one large dashboard-style card.

Individual content sections within the study view — meaning, context,
examples, notes — may use normal Polyglot card surfaces. The rule forbids one
dashboard-style wrapper around the whole lesson, not all surfaces everywhere.

The quiz phase is a separate case and uses no cards at all. See §26.

The central learning content may scroll vertically.

The bottom lesson-control area should remain easily available while studying.

---

# 13. Lesson Header

The active lesson should provide compact session context.

## Top Left

Display an icon-only exit control. Use a single Lucide icon with no visible
text label.

The control must carry an accessible name, for example
`aria-label="Exit lesson"`, and a tooltip on hover, since the label is not
visible.

Lesson context sits separately as quiet text and is not attached to the exit
control.

Example context:

`Level 1 • Lesson 2`

## Top Center

Display the current learning item prominently.

Vocabulary example:

    aprender
    to learn

Grammar example:

    y
    and

The title should be visually dominant without becoming an oversized
landing-page hero.

Use vocabulary or grammar category styling where appropriate.

Vocabulary uses the existing vocabulary learning color.

Grammar uses the existing grammar learning color.

Do not communicate item type through color alone. Pair the category color with
a text label or icon.

## Progress Context

Show current study position such as:

`2 / 6`

Keep this compact.

---

# 14. Lesson Study Tabs

Below the current item heading, provide:

`Details | Examples | Resources`

These follow the structural concept shown in the Bunpro reference.

They operate within the current learning item rather than navigating to a
different route.

Use accessible tab behavior.

---

# 15. Vocabulary Lesson Content

Where available, vocabulary lesson content may display:

## Details

- target-language word
- English meaning
- dictionary/general definition
- article
- part of speech
- pronunciation guidance
- IPA
- pronunciation audio
- context
- creator notes
- user notes

Pronunciation audio should appear near pronunciation/IPA information rather
than in an unrelated distant section.

## Missing Media

The `media` domain and R2 storage do not exist yet.

When audio is unavailable, degrade to text-only pronunciation guidance per
`architecture.md`'s graceful-degradation rule. Do not render a dead play
control, and do not block the lesson on missing media.

## Examples

Display the item's configured example sentences and supporting examples.

Example sentences remain supporting curriculum content and do not represent
independent SRS items.

## Resources

Display configured approved learning resources.

Do not invent resource content.

---

# 16. Grammar Lesson Content

Where available, grammar lesson content may display:

## Details

- grammar structure
- meaning
- explanation
- usage
- relevant metadata
- context
- creator notes
- user notes

## Examples

Display configured examples demonstrating the grammar concept.

## Resources

Display configured supporting resources.

Do not invent Bunpro-specific controls such as:

- Hint / hint-level controls
- Mark as Mastered
- Add to a Deck

unless Polyglot independently introduces those behaviors later.

The Bunpro reference screenshot shows a `Hint ●●○○` control in the lower left.
Polyglot has no hint system specified anywhere. It must not appear.

---

# 17. Bottom Lesson Progress

Follow the simple visual concept from the Bunpro screenshot.

Show one short horizontal segment for every learning item in the lesson batch.

For six items:

`━━━  ━━━  ━━━  ━━━  ━━━  ━━━`

The segments act as the lesson item selector during study.

Track these visual states:

- current
- already opened
- not yet opened

The current item must be visually distinct.

Use semantic theme colors rather than hardcoded colors.

Neutral segments should visually resemble the simple light bars used by
Bunpro while remaining consistent with Polyglot.

The active item's segment may use the item's learning-category accent.

## Non-Color Encoding

Progress must remain understandable without relying exclusively on color.

Distinguish the states by shape as well as color — for example a solid bar for
viewed, an outlined or dashed bar for not viewed, and a taller bar with a
marker for the current item. Three shades of the same treatment is not
sufficient.

Provide accessible labels such as:

- `Vocabulary item 1 of 6, viewed`
- `Grammar item 2 of 6, current`
- `Vocabulary item 3 of 6, not viewed`

where appropriate.

---

# 18. Moving Through Study Items

The learner can navigate lesson items with:

- `Next`
- the bottom lesson selector

Opening an item marks that item as viewed in the current ephemeral lesson.

The learner may return to previously viewed items.

The learner may move among lesson items before beginning the quiz.

Do not require a minimum time spent on an item.

Do not require scrolling to the bottom.

Do not interpret merely rendering the first item as viewing every item.

## Next Behavior

`Next` advances to the next item in batch order.

On the last item in the batch, if any earlier item has not yet been viewed,
`Next` advances to the first unviewed item rather than dead-ending. The label
may change to reflect this.

On the last item when every item has been viewed, the primary action becomes
`Start Quiz` per §20.

`Next` is never disabled during the study phase.

---

# 19. Server-Validated Viewed State

Viewed-item state used to unlock the quiz should be represented in the signed
ephemeral lesson state.

When an item is opened, the client may request an updated lesson state.

The server validates:

- authenticated user
- lesson token
- session identity
- requested item belongs to the batch

The server then marks that item as viewed in the ephemeral state and returns
a replacement signed token.

This does not create database progress.

---

# 20. Quiz Availability

The comprehension quiz is unavailable until every item in the lesson batch
has been opened at least once.

Until that point, the primary action is:

`Next`

Once every lesson item has been opened, expose:

`Start Quiz`

The learner may still move between study items before starting the quiz.

The client must not be able to unlock the quiz simply by setting local
`isViewed` values.

When `Start Quiz` is requested, the server validates the signed lesson state.

---

# 21. Starting the Quiz

When the learner selects `Start Quiz`:

1. Authenticate the user.
2. Validate the lesson-state token.
3. Verify the token belongs to the user.
4. Verify the token belongs to the active language.
5. Verify every lesson item has been viewed.
6. Validate the lesson batch structure.
7. Build required quiz-question state.
8. Set the session phase to `quiz`.
9. Sign and return the updated lesson state.

No SRS progress is created at this point.

---

# 22. Quiz Question Requirements

Every lesson item must satisfy all of its required comprehension questions
before the lesson may complete.

The lesson domain determines what requirements exist.

Do not hardcode quiz requirements inside React components.

## Initial Question Order

The initial question queue is built server-side when the quiz starts.

Interleave questions across lesson items. Two questions belonging to the same
lesson item must never be adjacent in the initial queue — a bidirectional
vocabulary item's two directions in particular must be separated.

The order must be deterministic under test. If randomization is used to make
ordering feel natural, it follows the same injectable/seedable rule as §37.

This is separate from the retry ordering in §33. Retry ordering governs
questions that have already been answered incorrectly; this governs the first
pass.

---

# 23. Vocabulary Quiz Requirements

Vocabulary is normally tested in both directions:

1. Target language → English
2. English → target language

For Spanish this means, for example:

`gato` → `cat`

and:

`cat` → `gato`

Both required directions must eventually be answered correctly.

A vocabulary item's lesson requirement is not complete until all configured
required directions have been satisfied.

## Article Enforcement

Spanish nouns must enforce the appropriate article according to existing
curriculum rules.

The article is required for **English → Spanish only**. If the curriculum
requires `el gato`, then:

- `cat` → `el gato` is correct
- `cat` → `gato` is incorrect, and the feedback explains that the article is
  required and why
- `el gato` → `cat` is correct; the learner is not asked to supply an article
  in English

Do not silently ignore the article requirement, and do not accept the bare noun
with a passive warning. A missing article is an incorrect answer that enters
the retry queue like any other.

---

# 24. Vocabulary Accepted Answers

Answer validation must support existing curriculum answer information such as:

- primary meanings
- accepted synonyms
- accepted spellings
- accepted variations
- user-created synonyms where the existing product rules allow them

Minor spelling mistakes may be tolerated when the learner's intended answer
is clearly correct according to the centralized answer-checking rules.

Do not implement answer similarity separately inside the lesson UI.

The same centralized answer-checking behavior should be reusable elsewhere.
The review session in a later spec will consume the same module.

---

# 25. Grammar Quiz Requirements

Grammar uses the question format configured for the grammar concept.

Supported concepts may use formats such as:

- translation
- fill-in response
- ordered word bank
- another already-defined grammar comprehension format

Do not invent a new grammar quiz format when the curriculum data does not
define one.

The lesson engine should represent question requirements generically enough
that vocabulary and grammar can share the session/retry system without
forcing them into the same prompt format.

---

# 26. Quiz UI

Keep the quiz inside the same full-focus lesson experience.

The normal application navigation remains hidden.

The quiz screen is chromeless. There are no cards, panels, bordered
containers, or tinted surfaces anywhere in the quiz. The graph-paper
background is the only surface. Content sits directly on it.

Conceptually:

    [exit]                              Beginner 1 · 4 / 12 · 86%




                              cat
                        English → Spanish


                      ______________________

                        á é í ó ú ü ñ



              ━━━   ━━━   ━━━   ━━━   ━━━   ━━━

## Vertical Composition

The prompt and answer line are centered as a group in the space above the
bottom progress segments, with generous empty area above and below.

The Bunpro reference pins its input near the bottom of the viewport, which
works because the review screen has no bottom progress bar. The lesson quiz
keeps its progress segments per §39, so the input sits above them instead.

Do not compress the quiz into the top third of the viewport. The emptiness is
intentional and is the primary visual difference between the quiz and every
other Polyglot screen.

## Top Bar

**Top left:** the icon-only exit control from §13. Nothing else.

**Top right:** compact session context as plain text. Include the SRS stage the
items are working toward, questions answered against total required, and
running accuracy. Keep this quiet — small, muted, one line. It must not compete
with the prompt.

This matches the review-interface top bar in `ui-context.md`. Lessons and
reviews use the same composition.

## Prompt

The prompt is the visually dominant element on the screen.

Display the direction indicator, for example `English → Spanish`, beneath the
prompt as small muted text.

For grammar formats that embed a blank, render the blank inline within the
prompt sentence as an underlined gap. Do not move the sentence into a
container to accommodate the blank.

## Answer Input

The answer input is a single underline, not a bordered or filled field.

Use a bottom border only. No side borders, no top border, no background fill,
no border radius, no shadow.

The input is centered, with centered text, and is wide enough for a full
sentence answer.

The underline uses `--border-default` at rest and the learning-category accent
on focus. Focus must remain visible without relying on the color change alone —
thicken the rule on focus as well.

Use the existing Polyglot review-interaction language where appropriate.

---

# 27. Language Character Helpers

When appropriate for the active language, display configured character helpers.

For Spanish:

- á
- é
- í
- ó
- ú
- ü
- ñ

Character helpers render as plain text glyphs directly below the answer line.

They must not use bordered chips, filled backgrounds, or button surfaces.
Spacing and hover state alone distinguish them.

Character helpers must:

- be keyboard accessible and show a visible focus ring, which may be the only
  bordered treatment they ever receive
- work on touch devices, with a touch target of at least 44px even though the
  visible glyph is smaller
- insert at the current caret position where practical
- not erase the existing answer
- remain visually secondary to the answer line

Do not permanently hardcode Spanish-specific controls into a component that
future languages cannot configure.

---

# 28. Quiz Keyboard Behavior

`Enter` is the primary quiz hotkey.

Expected behavior:

1. If the question has not been submitted, Enter submits the answer.
2. If feedback is currently displayed, Enter advances to the next question.

Do not require mouse interaction for normal lesson quiz flow.

Keyboard focus must remain predictable as questions change.

Submitting an empty answer does nothing and shows no error. It is not an
incorrect attempt and must not affect session accuracy.

---

# 29. Server-Authoritative Answer Submission

Every quiz answer is validated by the server.

Conceptually, the client sends:

- current signed lesson-state token
- current question identifier
- learner's answer

The client does **not** send trusted claims such as:

`isCorrect: true`

or:

`questionComplete: true`

The server:

1. authenticates the user
2. validates the signed lesson token
3. verifies session/user/language ownership
4. validates the submitted question belongs to the current lesson state
5. loads the authoritative curriculum item
6. loads accepted answer rules
7. evaluates the answer
8. updates satisfied requirements or retry state
9. determines the next question state
10. signs the replacement lesson-state token
11. returns feedback and updated state

The browser is never authoritative for correctness.

---

# 30. Correct Answer Behavior

When an answer is correct:

- mark that quiz requirement satisfied
- update the ephemeral lesson state
- show clear success feedback
- allow the learner to continue immediately

Correct feedback follows the chromeless rule in §26. The answer line turns
`--state-success` and is paired with a check icon and text. No success card, no
tinted banner.

Correct feedback may include:

- success styling on the answer line
- check icon/animation
- short positive feedback transition

Animation must not determine progression.

The next question must never be blocked waiting for a decorative animation to
finish.

---

# 31. Incorrect Answer Behavior

An incorrect lesson answer does not fail the lesson.

An incorrect lesson answer does not cause an SRS penalty.

The item has not entered SRS yet.

When an answer is incorrect:

1. Mark the answer line with error styling — the rule turns to `--state-error`
   and thickens.
2. Show the incorrect state with an icon and text, never color alone.
3. Expand supporting information directly below the answer line as plain
   stacked text on the page background.
4. Show what the learner entered and the expected answer as labeled values, not
   as a table or a card.
5. Explain what was wrong where that information exists, as a short muted
   paragraph.
6. State that the question returns later and that no SRS progress is affected.
7. Keep the quiz requirement unresolved.
8. Place the question into the retry system.
9. Continue the quiz.

The feedback region uses no card, panel, border, or tinted background. It may
use a single horizontal rule to separate itself from the answer line if
separation is needed.

Incorrect feedback should educate rather than merely display red.

The learner must eventually answer every required question correctly.

---

# 32. Incorrect-Answer Retry Scheduler

The retry scheduler belongs to:

`domains/lessons/`

Do not implement retry ordering directly inside a React component.

The scheduler should be deterministic and independently unit testable.

---

# 33. Retry Spacing Rule

Incorrect questions must not normally be repeated immediately.

When a question is answered incorrectly:

- keep it unresolved
- place it in the pending-retry queue
- continue with other unresolved questions first
- when enough other questions exist, at least 3 other questions should occur
  before the failed question becomes eligible to return
- after sufficient spacing, the retry may be mixed back into the remaining
  quiz
- placing the retry at the end is valid
- if fewer than 3 other unresolved questions remain, push the failed question
  as far toward the end as practical
- only repeat a failed question immediately when it is the only unresolved
  question remaining

---

# 34. Retry Example

Initial queue:

`A B C D E`

The learner answers:

`A = incorrect`

Invalid order:

`A A B C D E`

Valid examples include:

`A B C D A E`

or:

`A B C D E A`

The important rule is that the failed question should be separated from its
retry whenever other quiz content is available.

---

# 35. Multiple Failed Questions

The retry scheduler must support more than one failed question.

Example:

Initial:

`A B C D E F`

Results:

- A incorrect
- B correct
- C incorrect

The system should continue mixing unresolved/retry questions without forcing
either A or C to repeat immediately.

Retry ordering must avoid starvation.

Every unresolved question must eventually become eligible to appear again.

---

# 36. Failed Retry

If the learner answers a retry incorrectly again:

- keep the requirement unresolved
- apply the retry-spacing rule again
- move it back into pending retries
- do not count the requirement as complete

The learner continues until the question is eventually answered correctly.

There is no maximum mistake count that causes normal lesson failure.

---

# 37. Retry Randomization

Randomization is allowed only if needed to make retry ordering feel naturally
mixed.

If randomness is used:

- isolate it within lesson-domain logic
- make it injectable or seedable
- do not call uncontrolled `Math.random()` throughout the implementation
- tests must be deterministic

A deterministic spacing algorithm is also acceptable.

The core product requirement is spacing, not true randomness.

---

# 38. Server-Authoritative Retry State

Retry state must be represented within the server-signed ephemeral lesson
state.

The client may render the current question but must not authoritatively decide:

- when a retry becomes eligible
- whether a failed requirement is complete
- whether pending retries remain

The server-issued lesson state is authoritative for quiz completion.

---

# 39. Quiz Progress

Continue the bottom progress treatment during the quiz.

The segments represent **lesson items**, not every question attempt.

For six lesson items:

`━━━  ━━━  ━━━  ━━━  ━━━  ━━━`

Retries do not add new lesson-item segments.

Highlight the item associated with the current quiz question.

Because questions are interleaved per §22, the highlighted segment moves
around rather than advancing left to right. This is expected.

## Quiz Segment States

Track four states during the quiz:

- current — the item the active question belongs to
- complete — every required question for the item is satisfied
- partially satisfied — at least one required question satisfied, at least one
  still unresolved or pending retry
- not started — no required question satisfied yet

Distinguish these by shape as well as color, per §17.

---

# 40. Quiz Item Completion

A lesson item's progress segment becomes complete only when all required quiz
questions for that item are satisfied.

For a normal bidirectional vocabulary item, this means both:

- target → English
- English → target

must be correct.

Example:

If:

`gato → cat`

is correct but:

`cat → gato`

is incorrect and waiting for retry,

the `gato` item remains incomplete and renders as partially satisfied per §39.

Grammar items are complete only after all of their configured requirements are
satisfied.

---

# 41. Quiz Completion

The lesson quiz completes only when:

- every lesson item has satisfied every required comprehension question
- there are no unresolved requirements
- there are no pending retry questions

The lesson does not have a traditional fail state.

Incorrect answers extend the lesson rather than failing it.

---

# 42. Completed Lesson-State Proof

The browser must not be able to complete a lesson merely by sending:

`completeLesson([itemIds])`

The final SRS enrollment operation requires a valid server-signed lesson state
showing that the comprehension quiz has completed.

A completed lesson state must prove that:

- the session is in the correct final quiz state
- all required quiz questions are satisfied
- no retry questions remain
- all lesson items have completed their comprehension requirements

The client cannot manufacture this state because it is server-signed.

---

# 43. Final Lesson Completion Request

After the final required quiz answer succeeds, the client may initiate the
final lesson completion operation.

The request must include:

- completed signed lesson-state token
- client-generated idempotency key

Do not trust a client-provided list of completed item IDs by itself.

## Single Use

A completed lesson token is not revocable, because nothing about it is stored.
A learner who retains a completed token can replay it with a fresh idempotency
key.

The guard against this is the already-enrolled revalidation in §44, not the
token itself. Do not treat the signature as sufficient protection against
replay, and do not skip the revalidation because the token looks complete.

---

# 44. Final Server Revalidation

Even when the signed lesson state shows quiz completion, the server must
revalidate authoritative persistent state before enrollment.

Validate:

- authenticated user
- active language
- token ownership
- token validity
- lesson batch integrity
- item eligibility
- item availability
- curriculum state
- items are not already learned/enrolled
- applicable access rules

The token proves the ephemeral lesson flow was completed.

The database remains authoritative for whether SRS enrollment is currently
valid.

## Already-Enrolled Batches

If any item in the batch is already enrolled — a replayed token, or the same
batch completed in a second tab — reject the entire completion with a
structured error. Do not enroll the remaining items, and do not silently skip
the duplicates. §45's all-or-nothing rule applies to this case too.

The learner sees an explanation that these items have already been learned and
a route back to the dashboard. Do not present this as a failure that lost their
work, because the earlier completion already succeeded.

---

# 45. Atomic Lesson Enrollment

The full lesson batch enters SRS as one completion operation.

Final enrollment must be transactional.

Either:

- every lesson item enters SRS

or:

- none of the lesson items enter SRS

Never partially enroll a lesson batch.

If enrollment of one item fails, roll back the entire lesson enrollment
operation.

---

# 46. Initial SRS Stage

After successful lesson completion, every newly learned lesson item enters:

`Beginner 1`

Do not assign Beginner 1 directly inside React code.

Do not calculate SRS state in the browser.

The lesson domain requests enrollment through the centralized SRS domain.

The SRS domain remains authoritative for assigning core SRS state.

## Side Effects Not In Scope

Lesson completion in this spec awards no XP, touches no streak, and triggers no
level-unlock evaluation.

Level unlock cannot be affected regardless: the configured threshold requires
items at Familiar 1 or above, and lesson completion produces Beginner 1. Do not
wire unlock recalculation into the completion transaction.

---

# 47. Initial Review Scheduling

The centralized SRS domain calculates the item's first scheduled review.

Use:

- Beginner 1
- curriculum level
- authoritative server time
- configured SRS schedule

Do not calculate the next review timestamp in the UI.

Do not trust browser time.

Do not scatter interval constants inside lesson code.

---

# 48. Early-Level Accelerated Scheduling

Curriculum Levels 1 and 2 use the configured accelerated early-stage SRS
schedule.

The lesson domain does not need special conditional timing logic.

It should provide the relevant item/level information to the SRS domain.

The SRS domain determines whether the normal or accelerated schedule applies.

---

# 49. Lesson Completion Idempotency

Lesson completion changes learner progress and therefore requires idempotency.

The client generates one UUID idempotency key for the logical final lesson
completion operation.

If the network request is retried, reuse the same key.

Do not generate a new idempotency key for each retry of the same logical
operation.

The server records the idempotency key transactionally with the lesson
enrollment effect.

A duplicate request with the same valid key and payload must return the
original result rather than enrolling the lesson again.

A reused key with a different payload must be rejected.

Client-side button disabling alone is not sufficient protection.

This depends on the idempotency mechanism in `architecture.md`, which does not
exist yet. See Prerequisites.

---

# 50. Lesson Completion Rate Limiting

Lesson completion is a progress-affecting mutation and must use the project's
rate-limit provider.

Do not implement ad hoc rate limiting inside the lesson route.

Rate limiting must use the centralized provider boundary in
`providers/rate-limit`.

Progress-affecting mutations fail closed according to the existing
architecture.

This depends on the rate-limit provider, which does not exist yet and whose
backing store is still an open question. See Prerequisites.

---

# 51. Completion Screen

After successful enrollment, show a focused lesson-complete state.

Display:

- lesson completed
- number of newly learned items
- newly learned items
- Beginner 1 as the new SRS stage
- session accuracy/results when available
- primary return action

Conceptually:

    Lesson Complete!

    6 new items learned

    Beginner 1

    gato
    aprender
    y
    ...

    Accuracy: 86%

    [ Return to Dashboard ]

The completion screen may use normal Polyglot surfaces. The chromeless rule in
§26 applies to the active quiz, not to this result state.

Do not turn this into a large gamification feature yet.

A subtle completion animation is acceptable.

Do not implement an elaborate celebration system in this spec.

---

# 52. Session Accuracy

Track session statistics sufficient to display lesson accuracy.

Accuracy should reflect the learner's actual attempts, including incorrect
attempts.

Retries therefore affect session accuracy.

Example:

10 total answer attempts
8 correct attempts

Accuracy:

80%

Empty submissions are not attempts and do not count, per §28.

Session accuracy is informational.

It does not affect the item's initial SRS stage.

Every completed lesson item still enters Beginner 1 regardless of mistakes
made during the lesson quiz.

---

# 53. Returning to Dashboard

After completion, provide:

`Return to Dashboard`

The dashboard should reflect the newly enrolled items using authoritative
progress data.

Do not preserve the temporary lesson quiz state after successful completion.

---

# 54. Exit Behavior

Provide an icon-only exit control in the top left throughout both study and
quiz, with an accessible name and a hover tooltip.

Because lesson sessions are intentionally ephemeral, leaving an unfinished
lesson is destructive.

Make this understandable to the learner.

An exit confirmation may say conceptually:

`Your unfinished lesson progress will not be saved.`

Do not imply that SRS progress will be lost because none has been created yet.

The confirmation dialog keeps normal Polyglot dialog styling. The chromeless
rule in §26 governs the quiz screen, not modals layered over it.

After confirmed exit:

- return to the dashboard
- create no lesson completion
- create no SRS progress
- leave the lesson items eligible

---

# 55. Refresh Behavior

Refreshing the page intentionally destroys the unfinished lesson.

Do not rebuild the lesson from:

- local storage
- cookies
- database session rows
- hidden persisted quiz state

After refresh, the learner must start a new lesson.

This is intentional product behavior.

---

# 56. Browser Closure Behavior

Closing the browser or tab does not save lesson progress.

No special `beforeunload` network persistence mechanism should attempt to
write unfinished lesson progress.

A browser warning may be used only if justified by normal UX behavior, but
must not create persistence.

---

# 57. Lesson Domain Boundary

Lesson behavior belongs in:

`domains/lessons/`

The lesson domain owns:

- lesson availability
- lesson priority
- lesson batch selection
- lesson study requirements
- viewed-item rules
- quiz requirement construction
- initial question ordering
- lesson answer-check orchestration
- quiz state transitions
- retry scheduling
- lesson completion determination
- creation/validation of lesson-specific ephemeral state
- orchestration of SRS enrollment after successful completion

Keep these rules out of React components.

---

# 58. SRS Domain Boundary

The SRS domain remains authoritative for:

- SRS stage definitions
- Beginner 1 assignment
- review schedule configuration
- initial next-review calculation
- normal vs accelerated interval handling
- persistent SRS state mutation

No other domain may directly invent or mutate authoritative SRS stages.

---

# 59. Curriculum Domain Boundary

The curriculum domain remains authoritative for learning content such as:

- vocabulary data
- grammar data
- meanings
- definitions
- examples
- articles
- pronunciation information
- accepted answer variations
- curriculum ordering
- item lifecycle state

The lesson domain consumes curriculum information rather than duplicating it.

---

# 60. Client State Boundary

React may manage ephemeral presentation state such as:

- current visible tab
- answer input contents
- whether feedback is expanded
- focus state
- animations
- local loading indicators

React must not become authoritative for:

- eligibility
- viewed-state proof
- correctness
- retry eligibility
- quiz completion
- Beginner 1 enrollment
- next review timestamps

---

# 61. Data Persistence Boundary

Unfinished lesson state:

**not persisted**

Completed lesson result:

**persisted atomically through progress/SRS state**

Official curriculum content and learner progress remain separate.

Do not store SRS stage directly on shared curriculum records.

---

# 62. Lesson API / Action Boundaries

Use thin Next.js entry points.

Potential operations conceptually include:

- start lesson
- mark/open lesson item
- start quiz
- submit quiz answer
- complete lesson

The exact transport mechanism may use Server Actions or route handlers
according to existing architecture conventions.

Do not place learning rules directly inside the action/route.

Each entry point delegates to lesson-domain/application services.

Validate every incoming payload with a Zod boundary schema, including the
lesson token, per `architecture.md`'s validation rules.

---

# 63. Error Handling

Use structured application/domain errors.

Relevant lesson errors may include existing errors such as:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `ITEM_NOT_FOUND`
- `LESSON_ITEM_NOT_ELIGIBLE`
- `CURRICULUM_VALIDATION_FAILED`
- `RATE_LIMITED`

Add these lesson-session errors, since the flow genuinely requires
distinguishing them:

- `LESSON_STATE_INVALID` — malformed, unsigned, tampered, or foreign token
- `LESSON_STATE_EXPIRED` — valid signature, past expiration
- `LESSON_ALREADY_ENROLLED` — §44's duplicate-batch case

Do not throw arbitrary user-facing strings throughout the codebase.

Malformed or expired lesson state should fail safely and require restarting
the lesson.

Error responses must not echo the token or the learner's answer.

---

# 64. Loading State

Every data-driven lesson view must have a deliberate loading state.

Use skeletons or focused placeholders matching the expected content shape.

Avoid layout shift when lesson data appears.

Do not display fake lesson content while loading.

---

# 65. Empty State

If the learner has no currently eligible lesson items:

- do not start an empty lesson
- show a clear empty state
- provide a route back to the dashboard

Conceptually:

`No lessons available right now.`

Supporting copy may explain that the learner can return when more material
unlocks.

Do not invent an unlock reason if the authoritative data does not provide one.

---

# 66. Error State

If lesson loading or a lesson operation fails:

- show safe, understandable feedback
- preserve no fake success state
- do not pretend progress was created
- allow an appropriate retry or dashboard return

If final enrollment fails, do not show the lesson as successfully completed
unless the transaction actually succeeded.

State clearly whether progress was saved. Per `ui-context.md`, ambiguity about
saved progress is the worst possible message.

---

# 67. Reduced Motion

Respect `prefers-reduced-motion`.

Reduced-motion users must retain identical lesson functionality.

Disable or simplify:

- decorative transitions
- answer feedback movement
- progress animations

Do not disable:

- correctness feedback
- state changes
- navigation
- completion information

Animations must never control authoritative lesson progression.

---

# 68. Performance

Lesson and quiz interactions should feel immediate.

Do not make the learner wait for animations before answering or advancing.

Prefer low client-component boundaries.

Keep non-interactive learning content server-renderable where practical.

Only the session controls requiring interaction should need client state.

Do not introduce a heavy global state library solely for lesson state.

---

# 69. Accessibility

The full lesson experience must be keyboard operable.

Ensure:

- semantic controls
- visible focus states
- accessible tabs
- accessible lesson progress
- progress not communicated by color alone
- item type not communicated by color alone
- correctness not communicated by color alone
- the icon-only exit control has an accessible name
- Enter works for quiz submission and advancement
- accent helpers are keyboard accessible
- appropriate `aria` labeling for progress segments
- touch targets remain usable, including the borderless accent helpers
- reduced-motion preferences are respected

Focus should move predictably when the active question changes.

---

# 70. Responsive Behavior

## Desktop

Use:

- centered learning content
- wide Bunpro-inspired focused layout
- generous but controlled whitespace
- bottom lesson navigation/progress
- normal vertical scrolling for educational content

## Mobile

Use:

- nearly full viewport
- vertically stacked content
- no horizontal scrolling
- easily reachable exit action
- easily reachable answer input
- tappable accent helpers
- tappable progress segments
- accessible bottom lesson controls

The progress bars may become narrower on mobile but must remain individually
recognizable.

On mobile the quiz's generous vertical whitespace compresses, but the prompt
must stay clear of the on-screen keyboard when the answer line has focus.

Do not simply scale down the desktop layout until it becomes cramped.

Recompose the page for smaller screens.

---

# 71. Security Requirements

A learner must never be able to gain progress by manipulating client state.

Specifically:

- do not trust client-supplied `isCorrect`
- do not trust client-supplied quiz-complete state
- do not trust client-supplied Beginner 1
- do not trust client-supplied next-review timestamps
- do not trust unsigned lesson state
- do not include authoritative correct answers inside client-readable tokens
- verify user ownership of every lesson token
- verify language ownership
- revalidate persistent state before final enrollment
- treat a completed token as replayable and rely on revalidation, not the
  signature, to prevent double enrollment
- make final enrollment idempotent
- make final enrollment transactional

---

# 72. Architecture Decision

Add the following architecture decision to `architecture.md` as **ADR-017**.
ADR-016 is the highest existing number.

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

# 73. Unit Tests — Lesson Availability

Add focused tests verifying:

- lesson eligibility is calculated server-side
- client item IDs cannot bypass eligibility
- lower unlocked levels receive priority
- configured batch size is respected
- default batch size works
- an empty eligible set does not create a lesson

---

# 74. Unit Tests — Study State

Verify:

- starting a lesson creates a signed ephemeral state
- lesson state contains only items selected by the server
- opening a valid batch item marks it viewed
- opening an item outside the batch is rejected
- quiz remains locked until every lesson item is viewed
- viewing items creates no SRS progress
- malformed lesson tokens are rejected
- modified lesson tokens are rejected
- expired lesson tokens are rejected
- token belonging to another user is rejected
- token belonging to another language is rejected
- `Next` on the last item routes to the first unviewed item

---

# 75. Unit Tests — Quiz Requirements

Verify:

- vocabulary produces both required directions where configured
- the initial queue never places an item's two directions adjacently
- initial ordering is deterministic under test
- Spanish nouns require the article for English → Spanish
- Spanish nouns do not require an article for Spanish → English
- a bare noun where an article is required is incorrect, not tolerated
- grammar uses its configured comprehension requirements
- correct answers satisfy the requirement
- incorrect answers leave the requirement unresolved
- lesson mistakes create no SRS penalty
- the client cannot submit trusted correctness
- answer validation uses authoritative curriculum data
- an empty submission is not recorded as an attempt

---

# 76. Unit Tests — Retry Queue

Test retry behavior explicitly.

Initial queue:

`A B C D E`

`A` is answered incorrectly.

Verify:

- A is not immediately next
- other questions are shown first
- A cannot return before the required spacing when enough questions exist
- A eventually returns
- A may appear at the end

Also verify:

- multiple incorrect questions
- second failure of the same question
- too few remaining questions for full spacing
- failed question pushed as late as practical
- only one unresolved question remaining
- no retry starvation
- deterministic behavior under testing
- pending retries prevent lesson completion

---

# 77. Unit Tests — Quiz Completion

Verify:

- quiz cannot complete with an unresolved required question
- quiz cannot complete with a pending retry
- one correct direction does not complete a bidirectional vocabulary item
- one correct direction renders the item as partially satisfied
- an item completes after all required directions are satisfied
- the lesson completes only after every lesson item is complete
- there is no lesson fail state caused by normal incorrect answers

---

# 78. Unit Tests — Final SRS Enrollment

Verify:

- completed signed lesson state is required
- incomplete signed state cannot enroll items
- final server revalidation runs
- already-learned items are detected
- a batch containing an already-enrolled item is rejected as a whole
- a replayed completed token with a new idempotency key does not re-enroll
- invalid curriculum state prevents enrollment
- successful completion enrolls every item into Beginner 1
- initial review time comes from the SRS domain
- Level 1 and 2 items use configured accelerated scheduling
- later levels use normal configured scheduling
- client-supplied stage/timestamp values are ignored
- no XP, streak, or level-unlock side effect occurs

---

# 79. Unit / Integration Tests — Atomicity

Verify:

- successful enrollment enrolls the whole batch
- simulated failure partway through enrollment rolls back everything
- zero items remain partially enrolled after transaction failure
- final lesson enrollment is one transactional operation

---

# 80. Unit / Integration Tests — Idempotency

Verify:

- first completion request succeeds
- retry using same idempotency key and same payload returns original result
- retry does not enroll items twice
- same key with a changed payload is rejected
- concurrent duplicate completion cannot award progress twice

---

# 81. Exit Tests

Verify:

- exit during study creates no progress
- exit during quiz creates no progress
- selected lesson items remain eligible afterward
- refreshing does not restore the unfinished lesson
- browser-level ephemeral state is not treated as authoritative progress

---

# 82. Component Tests

Test the important UI behavior.

Verify:

- lesson header renders current item
- the exit control has an accessible name despite having no visible text
- Details / Examples / Resources tabs work
- bottom progress has one segment per lesson item
- current segment is identifiable
- viewed segment state renders
- not-viewed state renders
- partially satisfied segment state renders during the quiz
- quiz action remains hidden/disabled until all items are viewed
- the quiz screen renders no card or panel container around the prompt, input,
  or feedback
- the answer input renders with a bottom border only
- top-right session context renders answered count and accuracy
- quiz feedback renders correctly
- incorrect answer supporting information appears
- accent helpers insert characters correctly
- accent helpers render without button or chip surfaces
- completion screen renders Beginner 1
- keyboard interactions work

---

# 83. Browser Verification

Verify the complete flow in a real browser.

## Standard Desktop Flow

1. Sign in.
2. Open `/lessons`.
3. Start an eligible lesson.
4. Confirm the normal app navigation is hidden.
5. Confirm the first learning item renders.
6. Confirm Bunpro-inspired structure with Polyglot styling.
7. Confirm the bottom item segments render.
8. Move through every lesson item.
9. Confirm viewed/current states update.
10. Confirm the quiz cannot begin before all items are opened.
11. Open the final unviewed item.
12. Confirm `Start Quiz` becomes available.
13. Start the quiz.
14. Confirm the quiz screen has no cards or panels.
15. Answer the first question incorrectly.
16. Confirm incorrect feedback appears below the answer line without a card.
17. Confirm the same question does not immediately repeat.
18. Answer several subsequent questions correctly.
19. Confirm the failed question returns later.
20. Answer its retry correctly.
21. Finish all remaining questions.
22. Confirm the completion screen appears.
23. Confirm all batch items now have Beginner 1 progress.
24. Return to the dashboard.
25. Confirm the dashboard reflects the new SRS items.

---

# 84. Browser Verification — Destructive Exit

Test:

1. Start a lesson.
2. View several items.
3. Exit.
4. Confirm the warning/confirmation behavior.
5. Confirm no lesson items entered SRS.
6. Start another lesson and confirm the items remain eligible.

Repeat during the quiz.

---

# 85. Browser Verification — Refresh

Test:

1. Start a lesson.
2. View several items.
3. Refresh the browser.
4. Confirm the unfinished lesson is not restored.
5. Confirm no SRS progress was created.

Repeat during the quiz.

---

# 86. Browser Verification — Security

Where practical in automated/integration verification:

- confirm `/lessons` redirects to sign-in when signed out
- modify a lesson token and confirm rejection
- reuse another user's token and confirm rejection
- submit an invalid question ID and confirm rejection
- attempt final completion with an incomplete lesson token
- replay a completed token with a new idempotency key and confirm rejection
- repeat a completion request with the same idempotency key
- confirm duplicate enrollment does not occur

---

# 87. Browser Verification — Responsive

Verify:

## Desktop

- light mode
- dark mode
- keyboard navigation
- bottom lesson controls
- scrolling learning content
- quiz whitespace composition holds at a tall viewport

## Mobile

- lesson content stacks cleanly
- no horizontal scrolling
- progress segments remain usable
- accent controls remain tappable despite having no visible button surface
- input remains visible above the on-screen keyboard
- bottom controls do not obscure content
- exit remains reachable

---

# 88. Browser Verification — Reduced Motion

Emulate:

`prefers-reduced-motion: reduce`

Confirm:

- lesson remains usable
- quiz remains usable
- progress state remains clear
- correct/incorrect state remains understandable
- no required interaction depends on animation
- completion remains fully functional

---

# 89. Out of Scope

Do not implement the following in this spec:

- normal scheduled SRS review sessions
- review penalties
- leech review
- custom lesson item selection
- custom lesson sessions
- custom decks
- demo-mode lessons
- XP, streak, or other gamification side effects of lesson completion
- level-unlock recalculation
- a hint system
- speaking practice
- listening practice
- reading practice
- writing practice
- journaling
- lesson recovery
- persisted unfinished lesson sessions
- resume-lesson functionality
- elaborate completion celebrations
- level-up celebration logic
- new grammar question formats not already represented by curriculum data
- broad redesigns of normal learning-item pages
- admin curriculum tooling

Keep this spec focused on the standard lesson lifecycle.

---

# 90. Implementation Units

Do not combine unrelated deferred infrastructure merely because the lesson
feature touches it conceptually.

Follow the existing spec-driven workflow.

Implement in the following units. Each unit is a separately verifiable step
with its own completion criteria. Do not attempt the whole spec in one pass.

Units 1–5 and 7 can proceed now against a fixture-backed curriculum service.
Unit 6 is blocked — see Prerequisites.

## Unit 1 — Lesson domain types and signed ephemeral state

**Done when:** the lesson state shape is defined; sign and verify round-trip;
`LESSON_STATE_SECRET` is wired through `lib/env.ts` and `.env.example`;
malformed, modified, expired, foreign-user, and foreign-language tokens are
rejected; §74's token tests pass.

## Unit 2 — Lesson batch availability and selection

**Done when:** eligibility and priority are calculated server-side; batch size
resolves through the configuration accessor; the empty case produces no lesson;
§73's tests pass.

## Unit 3 — Lesson study UI

**Done when:** `/lessons` exists in its own route group with no app chrome;
`proxy.ts` protects it; the study layout, tabs, item navigation, and bottom
segments work; viewed state round-trips through the signed token; loading,
empty, and error states exist; §82's study-phase tests pass; browser
verification of §83 steps 1–12 passes.

## Unit 4 — Quiz requirements and answer checking

**Done when:** requirements generate for vocabulary and grammar; the initial
queue interleaves deterministically; centralized answer checking handles
synonyms, variations, tolerance, and the article rule; answers are validated
server-side; §75's tests pass.

## Unit 5 — Retry scheduler and quiz UI

**Done when:** the scheduler satisfies §33–§37 deterministically; the
chromeless quiz screen renders per §26–§31; keyboard flow works; §76 and §82's
quiz tests pass; browser verification of §83 steps 13–21 passes.

## Unit 6 — Final atomic SRS enrollment

**Blocked.** Requires the database layer and the `users`, `curriculum`, `srs`,
and `progress` domains, plus idempotency storage and the rate-limit provider.

**Done when:** revalidation, atomic enrollment, idempotency, and rate limiting
work per §43–§50; §78, §79, and §80 pass.

## Unit 7 — Completion and result UI

**Done when:** the completion screen renders per §51; accuracy is correct per
§52; return to dashboard works. Can be built against a fixture completion
result ahead of unit 6.

## Unit 8 — Complete browser verification

**Done when:** §83–§88 all pass against the real flow.

Each unit must preserve the final architecture rather than creating disposable
logic in components.

If the required real users, curriculum, lessons, progress, SRS, or database
foundation does not yet exist, do not create broad temporary fixture
workarounds that violate the intended architecture. Use the fixture-backed
domain-service pattern from spec 06, or stop and record the block.

---

# 91. Progress Tracker

After meaningful implementation work, update:

`context/progress-tracker.md`

Record:

- which unit of Spec 07 was completed
- tests added
- browser verification completed
- migrations added if applicable
- unresolved questions
- next implementation unit
- any architecture decisions discovered during implementation

Do not leave the progress tracker stale.

---

# 92. Verification Commands

Before marking the completed implementation unit done, run all applicable
project checks.

At minimum:

- TypeScript/typecheck
- lint
- relevant unit tests
- relevant integration tests
- `npm run test`
- `npm run build`

If schema work is included:

- generate migration
- inspect generated migration
- run migration validation against the configured test/preview environment

Do not say the implementation is complete if required checks fail.

---

# 93. Check When Done

Each unit closes against its own criteria in §90.

The complete standard lesson implementation is done when all of the following
hold:

## Lesson selection

- lesson batches are selected server-side
- lower-level eligible curriculum receives priority
- configured lesson batch size works
- an empty eligible set shows the empty state rather than an empty lesson

## Study

- `/lessons` lives outside `app/(app)/` and is protected by `proxy.ts`
- lessons use a focused Bunpro-inspired Polyglot layout
- normal app navigation is hidden during lessons
- the exit control is icon-only with an accessible name
- the bottom progress indicator shows one segment per lesson item
- segment states are distinguishable without color
- users can navigate among lesson items
- every item must be opened before quiz availability

## Ephemeral state

- unfinished lesson state remains ephemeral
- unfinished lessons are not persisted to the database
- lesson state uses server-signed ephemeral state
- modified, expired, and foreign lesson state is rejected
- exiting or refreshing an unfinished lesson creates no progress

## Quiz

- vocabulary and grammar both participate in the lesson system
- vocabulary supports required bidirectional comprehension questions
- the article rule is enforced for English → Spanish only
- the initial queue never places an item's two directions adjacently
- the quiz screen uses no cards, panels, or bordered containers
- the answer input is an underline
- accent helpers render without button surfaces and remain tappable
- quiz answers are validated server-side
- the client cannot authoritatively claim correctness
- incorrect answers do not create SRS penalties
- incorrect questions are retried later rather than immediately
- retry spacing attempts to place at least 3 other questions between attempts
  when enough questions exist
- retries may be mixed later or placed at the end
- retries can fail repeatedly without failing the lesson
- every required question must eventually be answered correctly
- pending retries prevent quiz completion

## Enrollment

- final lesson completion requires valid completed signed state
- final completion revalidates authoritative persistent state
- a replayed completed token cannot double-enroll
- an already-enrolled batch is rejected as a whole with a structured error
- the whole lesson batch enters SRS atomically
- every successfully completed lesson item enters Beginner 1
- SRS review scheduling comes from the SRS domain
- Levels 1 and 2 receive accelerated scheduling through configuration
- duplicate completion requests cannot enroll progress twice
- lesson completion uses the configured rate-limit boundary
- no XP, streak, or unlock side effect occurs

## Presentation and verification

- completion results display correctly
- keyboard-only quiz flow works
- mobile layout works
- light mode works
- dark mode works
- reduced-motion mode works
- TypeScript passes
- lint passes
- tests pass
- build passes
- real-browser verification passes
- `progress-tracker.md` is updated