# Polyglot

## Overview

Polyglot is a language-learning web application for self-study learners and complete beginners. It combines a structured curriculum, vocabulary and grammar instruction, spaced repetition, and multiple practice modes in one system. Its core learning loop is inspired by WaniKani's SRS and dashboard model, Bunpro's treatment of grammar as structured study content, and Anki's deck-based practice. Polyglot's primary differentiator is that vocabulary and grammar are treated as distinct but equally important learning items, while the SRS system remains the foundation of long-term retention.

The first supported curriculum is Latin American Spanish focused on Mexican usage. The product must be designed so that additional languages can be added later without changing the core learning model. Future versions may include an advanced conversational language-learning assistant, but AI tutoring is not part of the initial product scope.

## Goals

1. Provide a reliable, structured curriculum in which vocabulary and grammar are taught together through a customizable SRS-based learning system.
2. Give learners a polished, understandable learning experience through a configurable dashboard, clear progress information, and practice modes that unlock as their knowledge grows.
3. Make curriculum and learning logic easy for administrators to maintain without compromising user progress, SRS accuracy, or previously working product behavior.

## Product Principles

- **Curriculum-first introduction:** The curriculum determines what content becomes available and in what order.
- **SRS-first retention:** Vocabulary and grammar enter scheduled SRS reviews after lessons and remain the primary mechanism for long-term retention.
- **Practice after learning:** Additional practice modes unlock based on the learner's level and learned content.
- **Strict progression:** Curriculum levels are sequential and cannot be manually skipped or unlocked by normal users.
- **User choice within structure:** Users may choose among available lessons, reviews, practices, and dashboard tools, but cannot bypass curriculum gating.
- **Language isolation:** Progress in one language is independent from progress in every other language.
- **Admin-authored curriculum:** Official curriculum content is created and maintained by administrators.
- **No duplicate learning content:** Duplicate learning items should be prevented within a language and during deck/import workflows.

## Core User Flow

1. A new visitor lands on the Polyglot landing page.
2. The visitor either signs in, creates an account, or opens the limited demo experience.
3. A new account completes onboarding, including selecting an active language. Only Latin American Spanish is available in v1, but the step exists so onboarding does not silently assume a language as more languages are added later.
4. A signed-in user selects their active language in settings.
5. The user arrives at the dashboard for that language.
6. The dashboard shows the user's current level, available lessons, reviews due, progress, review history, review forecast, and available practice activities.
7. The user starts a lesson session.
8. The lesson system selects available items using curriculum priority, favoring lower unlocked levels before higher ones.
9. The user studies each item through its meaning, pronunciation, metadata, examples, and supporting information.
10. The user completes a comprehension quiz for the lesson batch.
11. Each vocabulary item is tested in both target-language-to-English and English-to-target-language directions. Grammar items use an appropriate question format for the grammar concept.
12. Incorrect lesson answers return later in the same lesson quiz until the learner answers them correctly. Lesson mistakes do not carry an SRS penalty.
13. After the lesson quiz is completed, newly learned SRS items enter the first SRS stage.
14. The user returns to the dashboard and later completes scheduled reviews when they become due.
15. Review results update SRS progress, item statistics, dashboard data, and curriculum unlock progress.
16. As the user's level and learned content increase, additional practice modes and testing categories become available.
17. The user can return at any time to review progress, practice unlocked material, edit settings, manage their profile, or continue lessons and reviews.

## Curriculum

### Language Structure

The official curriculum follows this structure:

**Language → Levels → Vocabulary Groups + Grammar Points → Lessons → SRS Reviews → Unlocked Practice**

The first curriculum is Latin American Spanish focused on Mexican usage.

Every language uses the same top-level curriculum structure:

- 48 vocabulary items per level
- 4 vocabulary groups per level
- 12 vocabulary items per group
- 12 grammar points per level
- Optional intermissions for informational concepts or mini-lessons that are useful but are not appropriate as normal practicable grammar items

Official levels are sequential.

Users cannot manually skip official levels or unlock later curriculum levels.

A later level unlocks only after the required amount of earlier-level SRS content reaches the configured progression threshold.

### Learning Items

Official SRS learning items may include:

- Vocabulary
- Grammar
- Radicals
- Kanji

The initial Spanish curriculum primarily uses vocabulary and grammar.

A vocabulary item may contain:

- Target-language word
- English meaning
- General dictionary definition
- Article
- Part of speech
- Written pronunciation guidance
- IPA pronunciation
- Audio pronunciation
- Example context
- Example sentences
- Accepted synonyms
- Accepted variations or spellings
- Creator/admin notes
- User-created notes
- User-created synonyms
- SRS stage
- SRS statistics
- Unlock date
- Next review time
- Completion/Fluent date

Spanish nouns require the appropriate article as part of learning and testing.

A learning item may support multiple accepted meanings, spellings, synonyms, or variations. Answer checking should tolerate minor spelling errors when the user's intended answer is clearly correct.

Verb conjugations are associated with a base verb rather than treated as unrelated duplicate vocabulary items. Conjugated forms are not stored as separate curriculum items; verb conjugation practice references the base verb's vocabulary item directly and tracks its own progress separately from the base verb's core SRS state.

Example sentences are supporting content attached to vocabulary/grammar items. They are not an independent SRS learning-item type and never carry their own SRS stage or independently determine official curriculum SRS progress.

## Lessons

### Standard Lessons

- Default lesson batch size is 6 items.
- Users can change their preferred lesson batch size in settings.
- Available lesson items are selected through a priority queue.
- Lower-level available lessons take priority over higher-level available lessons.
- Each item is taught before it is tested.
- Users can inspect definitions, pronunciation, examples, notes, and other supporting information while learning.
- A comprehension quiz follows the teaching portion.
- Vocabulary is normally tested in both Spanish → English and English → Spanish directions.
- Grammar questions use formats appropriate to the grammar item. Translatable grammar may use translation questions, while conceptual grammar may use formats such as ordered word banks.
- An incorrect lesson answer returns later in the quiz.
- The learner must eventually answer the required lesson questions correctly before completing the session.
- Lesson mistakes do not reduce progress because the item has not entered SRS yet.
- Completing the lesson quiz places the item into its initial SRS stage.
- Lesson results show session accuracy before returning the user to the dashboard.
- Completed official lessons are not replayed as lessons.

### Custom Lesson Sessions

Users may create a lesson session from currently available lesson items by selecting the specific items they want to learn.

Custom lesson sessions follow the same teaching, comprehension-check, completion, and SRS-entry rules as standard lesson sessions.

## SRS and Reviews

### SRS Scope

The core SRS system governs official vocabulary and grammar learning.

Other skill areas such as speaking, listening, reading, writing, and similar practice modes maintain their own progression systems rather than directly sharing the vocabulary/grammar SRS stage.

An individual learning item can therefore have separate skill progress, such as speaking progress, in addition to its core SRS state.

### SRS Stages

The core progression is:

- Beginner 1
- Beginner 2
- Beginner 3
- Beginner 4
- Familiar 1
- Familiar 2
- Intermediate
- Master
- Fluent

Fluent represents completion of the normal scheduled SRS review cycle.

### Standard Review Intervals

- Beginner 1 → Beginner 2: 4 hours
- Beginner 2 → Beginner 3: 8 hours
- Beginner 3 → Beginner 4: 1 day
- Beginner 4 → Familiar 1: 2 days
- Familiar 1 → Familiar 2: 1 week
- Familiar 2 → Intermediate: 2 weeks
- Intermediate → Master: 1 month
- Master → Fluent: 4 months

### Accelerated Early-Level Intervals

For curriculum Levels 1 and 2:

- Beginner 1 → Beginner 2: 2 hours
- Beginner 2 → Beginner 3: 4 hours
- Beginner 3 → Beginner 4: 8 hours
- Beginner 4 → Familiar 1: 1 day

Later intervals follow the normal schedule.

### Review Scoring

For bidirectional SRS items:

- The SRS stage increases only when both required directions are answered correctly.
- The SRS stage decreases when either required direction is answered incorrectly.
- Incorrect-answer penalties use the configured SRS penalty calculation:

`new_srs_stage = current_srs_stage - (incorrect_adjustment_count * srs_penalty_factor)`

The exact penalty factor and minimum-stage handling are architecture/domain rules and must be defined separately before implementation.

### Review Behavior

- Reviews are scheduled and become available based on their due time.
- Normal early reviews are not permitted.
- The dashboard displays upcoming review volume in a forecast bar graph.
- Repeatedly missed items may be identified as leeches.
- Leech items receive dedicated leech-review support.
- Individual item progress can be manually reset from the item's page.
- Reaching Fluent completes the item's normal review cycle.
- Normal review completion does not prevent users from using the item in supplemental practice.

## Practice

Practice activities unlock according to curriculum level and learned content.

Planned practice categories include:

- Vocabulary and grammar SRS
- Example sentence practice
- Verb conjugation practice
- Reading
- Listening
- Speaking
- Writing and journaling
- Formal tests
- Leech review
- Deck study

### Speaking

- Speaking exercises use the device microphone.
- The learner repeats or responds to a provided prompt.
- Speech recognition evaluates the response.
- Audio recordings are processed temporarily rather than permanently stored.
- Speaking progress is tracked separately from the item's core SRS stage.

### Listening

Listening exercises may include:

- Hearing spoken dialogue and typing the meaning
- Hearing spoken dialogue and selecting the correct translation

Listening progress is tracked independently from the core SRS stage.

### Reading

- Reading content unlocks based on curriculum level.
- Reading is supplemental practice rather than a direct modifier of core SRS progress.

### Writing and Journaling

- Users can complete writing and journaling practice.
- Journal entries are saved.
- Users can revisit a journal archive/history.
- AI-assisted journal correction is a future feature and is not part of v1.

### Free Study

Users may practice previously learned and unlocked content outside scheduled reviews without changing its official SRS state.

## Testing

Polyglot supports multiple test categories that unlock based on learner progress.

Initial testing categories include:

- Curriculum/module-based tests
- Theme-based tests
- CEFR-oriented tests

Tests may use different interaction types depending on their purpose, including:

- Typing
- Multiple choice
- Listening
- Reading
- Other skill-specific formats

Tests may unlock other tests but do not directly modify normal SRS stages.

Users can:

- Review completed tests
- View previous scores
- Retake tests to improve their score
- Retake tests for practice
- Test out of eligible material when the applicable test supports that behavior

Example unlock rules such as CEFR testing becoming available after Level 10 or theme testing after Level 5 are curriculum configuration rules and must be represented explicitly rather than hardcoded informally.

## Dashboard and Navigation

### Dashboard

The dashboard is the main signed-in home experience.

Its default layout includes:

- Welcome/greeting card
- Available lessons card
- Reviews-due card
- Current progress
- Review activity line graph
- Upcoming review forecast bar graph
- Additional information/statistic widgets
- Cards or links for unlocked practice modes

Users are generally free to choose what to do next rather than being forced into a single activity.

Dashboard widgets are customizable.

Switching the active language updates the dashboard to show that language's independent progress while preserving the same overall dashboard structure.

### Primary Pages

The product may contain the following primary pages:

- Landing Page
- Dashboard
- Levels
- Reviews
- Decks
- Practice
- Journey
- Journal
- Settings
- Profile
- About
- Changelog
- Demo

Additional planned pages such as Community Forum, Pricing, Chatbot, Leaderboards, and Tournaments are outside the initial v1 implementation unless explicitly moved into scope later.

## Progress and Motivation

Polyglot includes optional motivation and activity systems:

- Streaks
- XP
- User rank
- Achievements/badges

XP represents site activity and may be earned through SRS and practice.

XP contributes to a user's rank.

Achievements and badges are visible from the user's profile.

Leaderboards and tournaments are planned future features and are not required for the base architecture.

## Accounts and Personalization

- A normal Polyglot account is required to save persistent progress.
- Authentication for v1 uses Clerk.
- Progress synchronizes across devices for authenticated users.
- Users can study multiple languages.
- Each language maintains independent curriculum, progress, reviews, and practice state.
- Users select their active language in settings.
- Users may edit their name, bio, country, and profile picture.
- Users may reset an individual item from its item page.
- Users may reset levels, languages, or their account from settings.
- User data export is not part of the current product scope.

## Demo Experience

The landing page provides a demo option without requiring an account.

The demo:

- Opens a default dashboard
- Uses the same general interface as the authenticated product
- Restricts curriculum content to Level 1
- Makes Level 1 demo content available without normal account progression requirements
- Exists to let visitors explore the core Polyglot experience before registering

## Administration

Polyglot requires an administrator interface for maintaining official content and safely testing the product.

Administrators must be able to:

- Add SRS items
- Edit SRS items
- Delete SRS items
- Add and manage practice content
- Reject duplicate content
- Move curriculum items between themes
- Move curriculum items between levels
- Maintain official curriculum organization
- Edit published curriculum without destroying existing user progress
- Use an admin sandbox/development mode to test learning environments and product behavior

Official curriculum is authored by administrators.

Normal users may add personal notes and accepted synonyms to items but cannot modify the official curriculum.

## Decks

### Default Decks

Polyglot provides admin-authored default decks as curated study collections (for example, themed or supplemental groupings of existing official curriculum items).

Default decks reference canonical official curriculum items rather than duplicating them.

Default deck study is separate from the official sequential curriculum and must not bypass official curriculum level gating.

### Custom Decks

Polyglot is intended to support user-created or user-imported custom decks for additional practice.

Custom deck content must not create accidental duplicate items within the applicable language, deck, or import workflow.

Custom deck study is separate from the official sequential curriculum and must not bypass official curriculum level gating.

Custom deck creation/import is a planned product capability but is not required for the initial v1 milestone unless explicitly moved into scope.

## Scope

### In Scope for v1

- Latin American Spanish curriculum focused on Mexican usage
- Architecture capable of supporting additional languages later
- Responsive web application
- Landing page
- Clerk authentication
- Demo experience
- Onboarding language selection
- Configurable dashboard widgets
- Sequential curriculum levels
- Vocabulary and grammar lessons
- Lesson comprehension quizzes
- Scheduled vocabulary and grammar SRS reviews
- Accurate SRS timing and curriculum unlock logic
- Detailed user settings
- Profile editing
- Progress tracking
- Review history and forecast widgets
- Verb conjugation practice
- Speaking practice
- Listening practice
- Reading practice
- Writing/journaling
- Default admin-authored decks and deck study
- Leech review
- Testing and test-history flows required by the configured Spanish curriculum
- Changelog
- Full administrator curriculum-management features
- Administrator sandbox/testing mode
- Streaks, XP, rank, and profile achievements
- Access-tier data model (free Levels 1-3 / premium Level 4+), unenforced during the v1 beta so all authenticated users have full access

### Out of Scope for v1

- CSV curriculum import and validation (descoped 2026-09-05 — decided unnecessary; official curriculum is authored directly through the Admin curriculum editors instead)
- AI chatbot/tutor
- AI journal correction
- AI-generated official curriculum
- Stripe or payment processing
- Additional language curriculum content beyond Latin American Spanish
- Custom/user-created deck creation and import
- Native iOS application
- Native Android application
- Apple Pencil-specific native learning features
- Community forum
- Leaderboards
- Tournaments
- User data export
- Production billing/subscription implementation

The product should still be designed so that future languages, native applications, payment systems, AI tutoring, and social features can be added without redefining the core curriculum and learning model.

## Future Direction

Future versions may add:

- Additional language curricula
- Advanced conversational AI language tutor
- AI-assisted journal correction
- Native iOS and Android applications
- Apple Pencil-specific writing and learning interactions on supported iPad devices
- Stripe-backed subscription management
- Community forum
- Leaderboards
- Tournaments
- Expanded custom-deck creation and import workflows

AI-generated responses may help learners, but AI must not modify the official curriculum automatically.

## Success Criteria

Polyglot v1 is successful when:

1. A user can reliably sign up, sign in, sign out, and return without losing progress.
2. A new learner can start Spanish Level 1, complete lessons, pass the lesson comprehension flow, enter SRS, and receive reviews at the correct scheduled times.
3. SRS stage changes are based on the defined correctness rules and never advance an item incorrectly.
4. Curriculum levels unlock only when their defined SRS progression requirements are satisfied.
5. Configured content rules, such as test unlock requirements, behave according to their explicit curriculum settings.
6. Dashboard lesson counts, review counts, progress information, graphs, and forecast widgets reflect the user's actual learning state.
7. Lesson, review, speaking, listening, reading, writing, and other practice sessions can be entered and exited without broken navigation, crashes, or corrupted progress.
8. User progress persists correctly across sessions and devices.
9. Users can safely change settings, customize dashboard widgets, and edit their profile without breaking learning state.
10. Administrators can add, edit, delete, reorganize, and test curriculum content without making ordinary curriculum maintenance unnecessarily difficult.
11. Curriculum updates do not unintentionally destroy or invalidate existing user progress.
12. New product implementations do not break previously working core flows.
13. The landing page and dashboard provide a polished, responsive, animation-friendly interface that remains understandable to a new user.
14. The system supports a complete Level 1 demo experience without requiring an account.
15. The codebase and data model remain prepared for future languages while v1 exposes only the Latin American Spanish curriculum.
16. Every change reaches production through an automated pipeline that blocks deployment when checks fail.
17. Schema changes deploy without downtime and without corrupting existing progress.
18. A database restore has been performed and verified before real learner data is at risk.
19. Errors are captured with enough context to diagnose them, without exposing user learning content.

## Non-Functional Requirements

The criteria above describe what the product does. These describe how well it must do it. They are product requirements, not implementation details, and the mechanisms that satisfy them are specified in `architecture.md`.

### Reliability

A learner's progress is the product. Losing it is the most damaging failure the system can produce.

- A submitted review that the interface reports as saved is durably saved.
- A duplicate or retried submission never awards progress twice.
- A failed submission leaves the item's previous state intact rather than in a partial state.
- Interrupting a session never corrupts progress already earned.

### Performance

The product is used in short, repetitive sessions. Latency compounds across dozens of reviews.

- Review submission feels immediate.
- Dashboard and review queues load without a perceptible wait on a normal connection.
- The application remains usable on mid-range mobile hardware and slower networks.

### Availability

- Target 99.5% monthly availability during beta.
- Analytics or monitoring outages never interrupt a learning session.
- Media unavailability degrades to text-only learning rather than a broken session.

### Security and Privacy

- A user's learning data, journal entries, and notes are visible only to that user.
- Administrative capability is enforced server-side on every request.
- Journal content and typed answers are never sent to analytics or error monitoring.
- Speech recordings are processed transiently and never persisted.

### Accessibility

- Every interactive element is keyboard reachable and operable.
- Correctness, progress, and errors are never communicated by color alone.
- All functionality remains available under reduced motion.

### Scale Assumptions for v1

v1 targets a beta population in the low thousands of users, one published language, and curriculum in the low tens of thousands of items. The architecture must not foreclose growth beyond this, but the product does not need to be built for it yet.

The scaling triggers in `architecture.md` define when these assumptions are revisited.

---

## Critical Product Workflows

The following workflows are considered core product behavior and must remain stable as the application grows:

- Sign in
- Sign out
- Settings
- Lessons
- SRS reviews
- Progress preservation
- Curriculum unlocks
- Dashboard learning-state display
- Administrator curriculum management

Technical invariants for protecting these workflows belong in `architecture.md`.
