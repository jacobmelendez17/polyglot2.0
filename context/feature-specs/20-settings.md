# Settings

## Goal

Build a complete Settings system for Polyglot.

Settings should give each learner control over:

- account information
- timezone and general behavior
- lesson/curriculum preferences
- review behavior
- SRS behavior
- visual appearance
- notification preferences
- account resets and destructive actions

The Settings system is not only UI.

Many settings directly affect:

- lesson selection
- curriculum ordering
- SRS stage changes
- SRS scheduling
- Fluent maintenance reviews
- Ghost Reviews
- leech classification
- Vacation Mode
- streaks
- review presentation
- account state

Those settings must be authoritative on the server.

With the exception of Appearance settings, never depend on:

```text
localStorage
client state
hidden controls
URL parameters
browser-submitted user IDs
```

to determine authoritative settings.

Appearance settings are presentation-only and may be stored/applied client-side.

---

## Routes

Use:

```text
/settings
/settings/account
/settings/general
/settings/lessons
/settings/reviews
/settings/appearance
/settings/subscription
/settings/notifications
/settings/api
/settings/danger
```

`/settings` redirects to:

```text
/settings/account
```

Settings is an authenticated area.

Add it to the existing authenticated application navigation/account menu.

Do not create a separate standalone authentication boundary for Settings.

---

## Layout

Desktop uses a persistent Settings sidebar.

Conceptually:

```text
Settings

Account
General
Lessons
Reviews
Appearance
Subscription
Notifications
API

Danger Zone
```

Example:

```text
┌─────────────────────────────────────────────────────┐
│ Settings                                            │
├────────────────┬────────────────────────────────────┤
│ Account        │                                    │
│ General        │                                    │
│ Lessons        │        Active settings page        │
│ Reviews        │                                    │
│ Appearance     │                                    │
│ Subscription   │                                    │
│ Notifications  │                                    │
│ API            │                                    │
│                │                                    │
│ Danger Zone    │                                    │
└────────────────┴────────────────────────────────────┘
```

The active section is clearly highlighted.

On mobile, do not squeeze the desktop sidebar into a narrow column.

Recompose it into a Settings navigation control/sheet/dropdown.

The URL remains authoritative for the currently selected section.

---

## Settings Authority

All non-Appearance settings are server-authoritative.

Conceptually:

```text
Settings control
      ↓
validated Server Action
      ↓
authenticated internal Polyglot user
      ↓
domain service
      ↓
database
      ↓
canonical saved value
      ↓
UI
```

The browser may request:

```text
lesson batch size = 10
```

but it does not decide:

```text
which user to modify
which language belongs to the user
whether the value is valid
how that setting affects SRS/curriculum
```

Every mutation must resolve the currently authenticated internal Polyglot user.

Never trust a browser-provided:

```text
userId
role
current SRS stage
current streak
leech status
review eligibility
next review date
```

as authoritative.

---

## Saving Settings

Normal settings should save immediately.

Example:

```text
Grammar SRS Strictness

[ 1 Stage ▼ ]

Saving...
✓ Saved
```

For an ordinary toggle/dropdown:

```text
change control
      ↓
submit one narrow setting mutation
      ↓
validate
      ↓
save
      ↓
return canonical value
      ↓
show Saved
```

If the mutation fails:

```text
Could not save setting.
```

and return the control to the last server-confirmed value.

Do not leave an unsaved value looking successfully persisted.

Do not use one giant:

```text
updateAllSettings(...)
```

request.

Prefer narrow mutations such as:

```text
updateTimezone
updateLessonBatchSize
updateGrammarPlacement
updateReviewType
updateSrsStrictness
updateSrsInterval
updateFluentMode
```

This prevents a stale settings page on another device from overwriting unrelated newer preferences.

---

## Settings Security

Server Actions must:

- resolve the authenticated user
- validate input with Zod
- validate language ownership/scope where applicable
- modify only the authenticated user's rows
- return safe structured errors
- never trust hidden client state
- never expose secrets
- never accept credential data into application persistence

Sensitive/destructive settings require stronger rate limits.

Examples:

```text
username change
password change
reset progress
manual streak adjustment
reset account
delete account
```

Danger Zone actions must also be idempotent where a retry could otherwise repeat destructive behavior.

---

## Database Approach

Do not create one giant untyped settings JSON object.

Use typed settings grouped by the domain that owns them.

Conceptually:

```text
users

user_preferences

user_language_settings

user_review_preferences

user_notification_preferences

user_vacation_periods

user_dismissed_notices

user_streak_adjustments

user_sentence_ghost_progress
```

Reuse existing tables where they already own the concept.

For example:

```text
users.timezone
```

already exists and remains authoritative.

The existing:

```text
user_language_settings
```

already owns curriculum preferences per learner/language and should be extended rather than replaced.

Use additive migrations.

---

## Effective Defaults

A user should not require a fully populated row containing every possible setting.

Resolve effective settings as:

```text
stored preference
        ??
Polyglot default
```

Conceptually:

```text
getEffectiveLessonPreferences(...)
getEffectiveReviewPreferences(...)
```

Defaults must be centralized.

Do not independently hardcode a default in:

```text
React
Server Actions
domains/srs
domains/lessons
database repositories
```

---

## Global vs Language-Specific Settings

Account-wide settings include:

```text
Name
Username
Email/password identity
Timezone
Hide English in reviews
NSFW content
Vacation Mode
Notifications
Dismissed warnings
Manual streak adjustment
```

Appearance is device/browser-local.

Language-specific settings include:

```text
Curriculum mode
Grammar placement
Lesson batch size
Lesson pronunciation

Grammar review type
Vocabulary review type

Grammar Ghost Reviews
Vocabulary Ghost Reviews

Grammar leech minimum SRS
Vocabulary leech minimum SRS

Grammar hints
Vocabulary hints

Review UI preferences

Grammar SRS strictness
Vocabulary SRS strictness

Grammar SRS interval
Vocabulary SRS interval

Review Queue Timing

Grammar Fluent Mode
Vocabulary Fluent Mode
```

A future Japanese learner may therefore use different review/SRS preferences from Spanish.

---

# Account

## Personal Information

### Name

When no name exists:

```text
Name
—
[Add]
```

When a name exists:

```text
Name
Jacob Melendez
[Edit]
```

Name must synchronize with the authenticated Clerk identity and Polyglot's internal user representation.

The Polyglot display name is what application UI should use.

This includes:

```text
Welcome back, Jacob
```

Do not leave the dashboard greeting on its current independent Clerk-only path once the synchronized internal value exists.

Changing the name must update the appropriate Clerk identity information and Polyglot's internal display representation safely.

---

### Username

Show:

```text
Username
jacobm
[Edit]
```

Username is a Polyglot identifier.

It should be:

- unique
- case-insensitively unique
- server validated
- database constrained

Recommended validation:

```text
3–30 characters
letters
numbers
underscore
```

Normalize the unique comparison to lowercase.

Example duplicate candidates:

```text
JacobM
jacobm
JACOBM
```

must conflict.

Do not rely on a client-side availability check as the final uniqueness guarantee.

---

### Email

Show:

```text
Email
jacob@example.com
[Edit]
```

Clerk remains authoritative for login email.

Changing an email must use the secure identity-provider verification process.

The new email must be verified before becoming authoritative.

Do not create a separate Polyglot authentication-email implementation.

---

### Password

Show:

```text
Password
••••••••
[Edit]
```

Open:

```text
Change Password

Old Password
[________________]

New Password
[________________]

Confirm New Password
[________________]

[Cancel] [Save]
```

Polyglot owns the modal UX.

Clerk owns the actual password credential.

Never:

```text
store passwords in Neon
log passwords
store password hashes owned by Clerk
return password values in action results
```

The new password and confirmation must match.

If the account does not currently use a password credential, use the appropriate Clerk credential-management flow instead of presenting an impossible old-password requirement.

---

## Beta

For now display:

```text
Beta Mode

Coming Soon
```

Do not implement a fake toggle that currently controls nothing.

Do not create backend fields solely for this placeholder.

---

## Tours

### Onboarding Tour

Provide:

```text
Onboarding Tour

Replay Polyglot's introduction.

[Replay]
```

Reuse the existing onboarding slideshow/components.

Replay mode must not reset:

```text
onboarding completion
curriculum preference
progress
SRS
language selection
```

It is only a replay.

### Dashboard Tour

Do not show the Dashboard Tour control until a real Dashboard Tour exists.

---

# General

## Time & Date

### Timezone

Provide a searchable/selectable IANA timezone dropdown.

Example:

```text
Timezone

[ America/Phoenix ▼ ]
```

Persist on:

```text
users.timezone
```

Timezone affects:

- displayed dates/times
- dashboard/stat date bucketing
- streak day boundaries
- Review Queue Timing
- Start-of-Day review scheduling

Store real timestamps in UTC/timestamptz.

Changing timezone must not rewrite historical:

```text
review_events
lesson completions
progress events
```

Those timestamps remain facts.

Timezone controls how date-oriented behavior interprets those facts.

---

## Content

### Hide English During Reviews

Provide:

```text
Hide English during Reviews      [toggle]
```

Default:

```text
OFF
```

This preference applies only to normal reviews.

It does not hide English from:

```text
Lessons
Item Detail
Dictionary
Level pages
general Practice
```

When enabled, English translations are initially hidden during reviews.

Explicit hint/reveal behavior may still expose English according to the configured Review Hint settings.

---

### NSFW Content

Provide:

```text
Show NSFW Content                [toggle]
```

Default:

```text
OFF
```

NSFW content may include:

- official curriculum items
- official example sentences
- learner-facing dictionary content associated with curriculum

Content requires authoritative classification.

Do not infer NSFW status in React.

The server-side learner read model must know whether content is:

```text
SAFE
NSFW
```

or an equivalent extensible classification.

NSFW content is hidden by default.

When hidden:

- NSFW lesson items are not selected
- NSFW example sentences are not shown
- NSFW dictionary senses/content are not exposed to the learner
- excluded NSFW content must not prevent the learner from progressing through a Level

If NSFW is enabled later, the previously hidden material becomes available.

Already-earned Level unlocks are never revoked just because more optional content becomes visible.

External/raw dictionary records remain source data.

Polyglot-owned content-classification metadata should determine whether imported dictionary material is learner-visible.

---

## Vacation Mode

Provide:

```text
Vacation Mode                    [toggle]

Freeze review scheduling and protect your streak while you're away.
```

Default:

```text
OFF
```

Vacation Mode applies to the learner's entire account, not only the active language.

It affects every learning language.

---

## Vacation Periods

Do not only store:

```text
vacation_mode = true
```

because completed vacations affect scheduling and streak interpretation.

Persist vacation periods.

Conceptually:

```text
user_vacation_periods

id
user_id
started_at
ended_at
created_at
```

Only one active vacation period may exist for a user.

Use a database/application constraint preventing overlapping active vacations.

---

## Vacation Review Behavior

While Vacation Mode is enabled:

- normal scheduled reviews are frozen
- Ghost Reviews are frozen
- review availability is paused
- streaks are frozen
- normal review due dates do not continue consuming waiting time

There is no separate "overdue" state.

An item is either:

```text
not ready
```

or:

```text
ready / due in the queue
```

If an item is already ready when Vacation Mode starts:

```text
Vacation starts
      ↓
item hidden/frozen
      ↓
Vacation ends
      ↓
item is immediately ready again
```

---

## Vacation Scheduling

Example:

```text
Review is 3 days away.

Vacation starts.
Vacation lasts 10 days.

Vacation ends.

Review is still 3 days away.
```

Its remaining interval is preserved.

Do not simply calculate:

```text
original due date + full vacation duration
```

for every item without considering when that item's current schedule began.

Items may also be learned during Vacation Mode.

Example:

```text
Vacation starts

5 days later:
new lesson completed

Review would normally be due in 4 hours

5 more vacation days pass

Vacation ends
```

The review should now be due:

```text
4 hours after Vacation Mode ends
```

not:

```text
5 days + 4 hours after returning
```

Use the item's relevant scheduling anchor:

```text
lastReviewedAt
or
learnedAt
or
Fluent maintenance scheduling anchor
```

to determine how much of the vacation actually overlaps its active waiting interval.

An item already due before the vacation remains due when the vacation ends.

Apply equivalent freeze behavior to Ghost Review due dates.

All schedule adjustments are server-side.

---

## Lessons During Vacation

Lessons remain available.

Before starting a lesson while Vacation Mode is enabled, show:

```text
You're currently in Vacation Mode.

New items can still be learned, but their review scheduling
will remain frozen until Vacation Mode ends.

Are you sure you want to start a lesson?

[Cancel] [Start Lesson]
```

If confirmed, the lesson functions normally.

Completing the lesson:

```text
→ enrolls the item into Beginner 1
→ calculates its normal schedule
→ Vacation Mode freezes the remaining interval
```

Do not block non-SRS supplemental practice during Vacation Mode.

---

## Vacation and Streaks

Vacation days are neutral.

They:

```text
do not increase streak
do not break streak
```

Example:

```text
Monday    review ✓
Tuesday   review ✓

Wednesday VACATION
Thursday  VACATION
Friday    VACATION

Saturday  review ✓
```

The learner's streak continues across the vacation.

Vacation Mode does not repair a streak that was already broken before the vacation began.

Timezone determines calendar-day boundaries.

---

# Lessons

Lesson settings are language-specific.

## Curriculum

### Learning Queue

Provide:

```text
Learning Queue

[ Default Order ▼ ]
```

Options:

```text
Default Order
Choose Group as You Go
Variety
```

This replaces the current learner-facing:

```text
Theme
Random
Balanced
```

terminology/system.

Reuse and extend the existing curriculum-decider domain rather than building a second lesson-selection implementation.

Changing Learning Queue:

- persists immediately
- affects future generated lessons
- never alters the currently active lesson session
- never changes learned items
- never changes SRS
- never changes existing progress
- never changes Level unlocks

---

## Curriculum Preference Migration

Existing curriculum preference data must be migrated rather than abandoned.

Conceptually:

```text
Theme
→ Choose Group as You Go

Balanced
→ Variety

Random
→ Variety
```

The old enum values should not remain as a second hidden behavior system after migration.

If migration requires a temporary compatibility layer, remove it when all stored settings use the new values.

---

## Default Order

Default Order uses the authored curriculum sequence.

At a new Level:

```text
Grammar first
      ↓
Vocabulary Group 1
      ↓
Vocabulary Group 2
      ↓
Vocabulary Group 3
      ↓
Vocabulary Group 4
```

The actual number of groups remains based on real Level content.

Do not hardcode four groups as a permanent schema assumption.

If a Level has:

```text
3 groups
```

then Default Order is:

```text
Grammar
Group 1
Group 2
Group 3
```

If it has five:

```text
Grammar
Group 1
Group 2
Group 3
Group 4
Group 5
```

Grammar is always first in Default Order.

The Grammar Placement setting does not override this mode.

---

## Choose Group as You Go

The learner chooses which available vocabulary group/theme to work through.

After the active group is completed, the learner chooses another.

Do not silently fill unused batch slots using another vocabulary group.

Example:

```text
Batch size: 10
Remaining items in Family: 2

Next lesson:
2 Family vocabulary items
+
eligible grammar according to normal grammar behavior
```

not:

```text
2 Family
+
8 vocabulary items from another unselected theme
```

Grammar remains part of the curriculum.

The separate Grammar Placement preference does not affect Choose Group as You Go.

Grammar follows its normal authored/configured progression.

---

## Variety

Variety pulls a little from each available vocabulary group.

Example:

```text
4 groups
8 vocabulary slots

Group A ~2
Group B ~2
Group C ~2
Group D ~2
```

Redistribute naturally if one group has fewer remaining items.

Do not require mathematically perfect equal distribution when the remaining curriculum cannot support it.

Grammar remains part of the lesson queue.

For Variety, Grammar Placement controls whether grammar is force-positioned before or after vocabulary.

---

## Grammar Placement

Provide:

```text
Grammar Placement

[ No Preference ▼ ]
```

Options:

```text
First
Last
No Preference
```

Behavior:

```text
Default Order
→ Grammar is always first.
→ setting ignored.

Choose Group as You Go
→ Grammar follows normal authored progression.
→ setting ignored.

Variety + First
→ prioritize eligible grammar before vocabulary.

Variety + Last
→ prioritize eligible grammar after vocabulary.

Variety + No Preference
→ grammar remains included.
→ no forced first/last position.
→ normal curriculum logic may interleave it.
```

`No Preference` does not mean:

```text
disable grammar
```

Grammar must still eventually be taught.

This setting changes learner-specific queue ordering only.

It never changes Admin-authored curriculum positions in the database.

---

## Batch

### Lesson Batch Size

Provide:

```text
Lesson Batch Size

[ 6 ▼ ]
```

Options:

```text
3
4
5
6
7
8
9
10
11
12
13
14
15
```

Default:

```text
6
```

The chosen value is the maximum preferred lesson batch size.

A lesson may contain fewer items if fewer eligible items are available.

Changing batch size affects the next generated lesson.

It does not modify an active lesson.

Do not hardcode the batch-size value inside lesson components.

The server-side lesson-selection service uses the stored effective preference.

---

## Audio

### Auto Pronunciation

Provide:

```text
Automatically pronounce new words     [toggle]
```

When enabled, automatically play pronunciation when a vocabulary item is introduced during Lessons.

Use the existing pronunciation/audio provider.

Prefer:

```text
recorded pronunciation when available
        ↓
browser speech synthesis fallback
```

Manual pronunciation controls remain available regardless of this setting.

---

# Reviews

Review settings are language-specific.

## Review Session Settings

Review preferences that can affect SRS must be resolved when a review session starts.

Conceptually:

```text
startReview(...)
      ↓
read effective user review preferences
      ↓
build session
      ↓
include authoritative relevant settings
in signed/server-controlled review state
```

If the user changes Settings in another tab while a review is active:

```text
active review keeps its original settings
next review session uses the new settings
```

Do not allow SRS behavior to change halfway through a signed review session.

---

## Review Types

Provide separate controls.

```text
Grammar Review Type

[ Cloze (Manual) ▼ ]
```

and:

```text
Vocabulary Review Type

[ Cloze (Manual) ▼ ]
```

Options:

```text
Cloze (Manual)
Cloze (Flashcard)
Flashcard
```

---

## Cloze (Manual)

Show a sentence with the target content removed.

Example:

```text
Yo ___ pan todos los días.

[____________]
```

The learner types the missing answer.

The server checks the answer using the existing authoritative answer-checking system.

Do not send the full accepted-answer set to the browser merely to grade locally.

### Vocabulary Cloze

Use an official example sentence containing the vocabulary term.

Hide that term.

Example:

```text
Vocabulary:
comer

Sentence:
Yo ___ pan todos los días.
```

If no compatible example sentence exists, fall back to Polyglot's normal manual vocabulary review prompt.

Do not invent a sentence at runtime.

### Grammar Cloze

Use an appropriate official/configured sentence for the grammar point.

Continue respecting the grammar item's configured review/question requirements.

---

## Cloze (Flashcard)

Show the same style of sentence blank.

Do not require typed input.

Example:

```text
Yo ___ pan todos los días.

[Reveal]
```

After Reveal:

```text
comer

[Don't Know] [Know]
```

SRS interpretation:

```text
Know
→ correct review result

Don't Know
→ incorrect review result
```

The browser chooses one of the allowed actions.

The server validates the signed review session and applies the authoritative SRS result.

---

## Flashcard

Show the normal review prompt.

Example:

```text
comer

[Reveal Answer]
```

Then:

```text
to eat

[Don't Know] [Know]
```

SRS behavior is the same:

```text
Know       → correct
Don't Know → incorrect
```

---

# Ghost Reviews

Ghost Reviews are separate from Leeches.

Do not use "Ghost" and "Leech" interchangeably.

A Ghost represents repeated supplemental review of a specific missed sentence/nuance.

A Leech describes an item with a calculated history of repeated difficulty.

---

## Ghost Review Settings

Provide:

```text
Grammar Ghost Reviews

[ On ▼ ]
```

and:

```text
Vocabulary Ghost Reviews

[ On ▼ ]
```

Options:

```text
On
Minimal
Off
```

---

## Ghost Review — On

When Ghost Reviews are:

```text
On
```

one incorrect normal review using a specific sentence creates a Ghost for that sentence.

Conceptually:

```text
sentence reviewed
      ↓
incorrect
      ↓
Ghost created
```

---

## Ghost Review — Minimal

When set to:

```text
Minimal
```

the same sentence must be missed more than once before the Ghost activates.

Conceptually:

```text
first miss
→ record sentence miss
→ no active Ghost yet

second miss
→ create active Ghost
```

The miss tracking must belong to the authenticated learner.

---

## Ghost Review — Off

When:

```text
Off
```

normal review mistakes do not create new Ghosts.

Turning Off Ghost Reviews should stop creating new Ghosts.

Existing active Ghosts should remain available unless explicitly reset from Danger Zone.

Do not silently delete historical/current Ghost state simply because the preference changes.

---

## Ghost SRS

Ghost Reviews have their own independent SRS.

Use:

```text
Ghost 1 → 4 hours
Ghost 2 → 12 hours
Ghost 3 → 24 hours
Ghost 4 → 48 hours
```

Conceptually:

```text
Ghost created
      ↓
4 hours
      ↓
Ghost 1 review
      ↓ correct
12 hours
      ↓
Ghost 2 review
      ↓ correct
24 hours
      ↓
Ghost 3 review
      ↓ correct
48 hours
      ↓
Ghost 4 review
      ↓ correct
Ghost completed
```

Once Ghost 4 is successfully completed:

```text
Ghost is gone
```

The underlying normal vocabulary/grammar SRS remains exactly where it would have been without Ghost Review progression.

---

## Incorrect Ghost Answer

If a Ghost Review itself is answered incorrectly:

```text
reset Ghost to Ghost 1
```

and schedule the next Ghost review for:

```text
4 hours
```

Do not apply another normal SRS penalty because a supplemental Ghost was answered incorrectly.

Normal and Ghost SRS must remain separate.

---

## Ghost Persistence

Add a dedicated Ghost progress model.

Conceptually:

```text
user_sentence_ghost_progress

id
user_id
language_id
learning_item_id
sentence_id

content_type

miss_count

ghost_stage
next_review_at

activated_at
completed_at

created_at
updated_at
```

For Minimal mode, a sentence may temporarily have:

```text
miss_count = 1
ghost_stage = null
```

while waiting for the second miss.

A learner cannot have duplicate active Ghost state for the same:

```text
user
language
learning item
sentence
```

Use an appropriate unique constraint.

---

## Ghost Queue

Due Ghost Reviews appear in the learner's review experience in addition to normal reviews.

They must be visually identifiable as supplemental Ghost Reviews.

Ghost completion modifies Ghost state only.

Normal review completion modifies normal item SRS.

Never use one stage field to represent both.

---

## Vacation and Ghosts

Vacation Mode freezes Ghost scheduling.

When Vacation Mode ends, use the same remaining-interval rules used for normal scheduled reviews.

A Ghost that was already ready before Vacation Mode becomes immediately ready after Vacation Mode ends.

---

# Leeches

A Leech is calculated from the learner's normal review performance.

Ghost Reviews do not participate in the leech calculation.

---

## Leech Formula

Use:

```text
incorrect answers
────────────────────────────── > 1
(current correct streak ^ 1.5)
```

Protect against zero:

```text
effectiveCorrectStreak =
max(currentCorrectStreak, 1)
```

Therefore:

```text
leechScore =
incorrectCount /
(effectiveCorrectStreak ^ 1.5)
```

An item is a Leech when:

```text
leechScore > 1
```

and it has satisfied the configured minimum SRS requirement.

---

## Leech Counters

`incorrectCount` means:

```text
lifetime incorrect normal-SRS outcomes
for the current learner/item progress history
```

`currentCorrectStreak` means:

```text
consecutive successful normal-SRS reviews
for that item
```

A normal incorrect review:

```text
incorrectCount += 1
currentCorrectStreak = 0
```

A successful normal review:

```text
currentCorrectStreak += 1
```

Ghost Reviews do not affect:

```text
incorrectCount
currentCorrectStreak
```

---

## Minimum SRS for Leech

Provide:

```text
Minimum Grammar SRS for Leech

[ Familiar 1 ▼ ]
```

and:

```text
Minimum Vocabulary SRS for Leech

[ Familiar 1 ▼ ]
```

Default:

```text
Familiar 1
```

The dropdown includes every normal SRS stage.

The setting means:

> The item cannot be classified as a Leech until it has reached at least that selected stage at least once.

Do not base this only on the item's current stage.

Example:

```text
Item previously reached Master.
Item later falls to Beginner 4.

Minimum Leech SRS = Familiar 1.
```

The item has still satisfied the minimum-SRS requirement.

Track:

```text
highestSrsStageReached
```

for this purpose.

---

## Leech Progress Data

Extend normal item progress with the authoritative fields required to evaluate Leeches efficiently.

Conceptually:

```text
current_correct_streak
highest_srs_stage_reached
```

Use existing normal review counts/history rather than creating a second review-history source.

For existing progress, backfill from durable review history where practical.

After migration, update:

```text
incorrect count
current correct streak
highest stage reached
```

in the same transaction as the normal SRS result.

Do not run asynchronous leech calculations after the review transaction.

---

## Leech Classification

Leech status is derived.

Do not permanently store a manually maintained:

```text
is_leech
```

boolean if it can become inconsistent with the underlying authoritative counters.

Expose a domain helper such as:

```text
calculateLeechStatus(...)
```

or equivalent.

Item Detail and future leech-focused experiences should use that same rule.

Do not reimplement the formula in React.

---

# Review Hints

Provide separate hint controls for Grammar and Vocabulary.

## Hint Order

Grammar:

```text
Grammar Hint Order

[ Nuance First ▼ ]
```

Vocabulary:

```text
Vocabulary Hint Order

[ Nuance First ▼ ]
```

Options:

```text
Nuance First
Translation First
```

### Nuance First

First reveal action:

```text
show nuance/context
```

Second reveal:

```text
show English translation
```

### Translation First

First reveal:

```text
show English translation
```

Second reveal:

```text
show nuance/context
```

---

## Hint Mode

Grammar:

```text
Grammar Hint

[ Hint ▼ ]
```

Vocabulary:

```text
Vocabulary Hint

[ Hint ▼ ]
```

Options:

```text
Hide
Hint
Show
More
Always Show Nuance
```

---

### Hide

Show only the target-language sentence/prompt.

Do not automatically display:

```text
English translation
hint keywords
nuance/context
```

---

### Hint

Default.

Show the target-language sentence.

Provide the normal hint area highlighting the relevant keyword, target concept, or grammar information without simply revealing everything immediately.

For grammar, this may highlight the relevant concept/keyword inside the English-support area.

For vocabulary, use the corresponding useful clue/context supported by the review item.

---

### Show

Display the full English translation.

---

### More

Display:

```text
full English translation
+
additional context / nuance notes
```

---

### Always Show Nuance

Hide the normal English translation but always keep the additional nuance/context notes visible.

---

## Hide-English Interaction

The General setting:

```text
Hide English during Reviews
```

controls automatic initial display.

Explicit hint/reveal actions may still reveal English.

More-specific review actions override the general initial-visibility preference.

---

# Review UI

## Autoplay Audio

Provide:

```text
Autoplay Audio                     [toggle]
```

Automatically play pronunciation where appropriate when a new review item appears.

This is separate from Lesson auto-pronunciation.

---

## Lightning Mode

Provide:

```text
Lightning Mode                     [toggle]
```

When enabled:

```text
correct answer
      ↓
show brief correctness feedback
      ↓
automatically advance
```

The learner does not press a second Next/Continue action after every correct answer.

Incorrect answers still show enough feedback to understand the mistake.

For self-graded review types:

```text
Know
→ correct
→ auto-advance
```

when Lightning Mode is enabled.

---

## Focus Mode

Provide:

```text
Focus Mode                         [toggle]
```

Focus Mode removes nonessential visual elements from the review session.

It must not remove:

- Exit
- prompt
- answer controls
- required feedback
- accessibility context
- essential progress information

Do not create a separate review implementation for Focus Mode.

Use presentation differences around the same review session.

---

## Auto Highlight Errors

Provide:

```text
Auto Highlight Errors              [toggle]
```

For typed answers, visually highlight incorrect portions where Polyglot can determine the difference confidently.

Do not fabricate a character-level mismatch when multiple accepted answers or normalization rules make the exact error ambiguous.

Authoritative correctness still comes from the server-side answer checker.

---

## Review SRS

Provide:

```text
Show SRS Stage                     [toggle]
```

Controls whether SRS-stage information is visible during review feedback.

This setting changes presentation only.

It never changes the actual SRS result.

---

## Auto-Expand Info

Provide:

```text
Auto-Expand Info                   [toggle]
```

After submitting a review answer, automatically expand supplemental information.

When Lightning Mode immediately advances after a correct answer:

```text
Lightning Mode
```

wins for that correct answer.

Do not open an information panel only to immediately navigate away.

Incorrect answers may still auto-expand supplemental information.

---

## Undo Action

Provide:

```text
Undo Action

[ Clear Last Character ▼ ]
```

Options:

```text
Clear All Characters
Clear Last Character
```

This applies to the Undo action for typed review answer fields.

Example:

### Clear Last Character

```text
hola

Undo
↓
hol
```

### Clear All Characters

```text
hola

Undo
↓
""
```

This preference may be server-persisted with the learner's other review settings even though the behavior itself is UI-level.

---

# SRS Strictness

Grammar and Vocabulary are configurable independently.

Provide:

```text
Grammar SRS Strictness

[ 1 Stage ▼ ]
```

and:

```text
Vocabulary SRS Strictness

[ 1 Stage ▼ ]
```

Options:

```text
1 Stage
2 Stages
3 Stages
Half
Full
```

Default:

```text
1 Stage
```

---

## New Default Incorrect Rule

Remove the current WaniKani-inspired Familiar+ penalty behavior.

The old rule:

```text
Beginner incorrect
→ drop 1 stage

Familiar+ incorrect
→ drop 2 stages
```

must no longer exist as the default.

New Polyglot default:

```text
Any incorrect normal SRS result
→ drop exactly 1 stage
```

unless the learner deliberately selects another SRS Strictness.

Do not leave the old 2-stage Familiar+ logic reachable through another code path.

---

## SRS Stage Order

Use the existing normal order:

```text
1  Beginner 1
2  Beginner 2
3  Beginner 3
4  Beginner 4
5  Familiar 1
6  Familiar 2
7  Intermediate
8  Master
9  Fluent
```

Minimum:

```text
Beginner 1
```

There is no Beginner 0.

---

## 1 Stage

```text
new stage =
current stage - 1
```

Examples:

```text
Master
→ Intermediate

Familiar 1
→ Beginner 4
```

Clamp at Beginner 1.

---

## 2 Stages

```text
new stage =
current stage - 2
```

Clamp at Beginner 1.

---

## 3 Stages

```text
new stage =
current stage - 3
```

Clamp at Beginner 1.

---

## Half

Use:

```text
floor(currentStagePosition / 2)
```

then clamp at Beginner 1.

Example:

```text
Master = stage position 8

floor(8 / 2)
= 4

→ Beginner 4
```

Another:

```text
Familiar 1 = 5

floor(5 / 2)
= 2

→ Beginner 2
```

---

## Full

Reset the item to:

```text
Beginner 1
```

Do not create Beginner 0.

---

## Correct Reviews

SRS Strictness changes incorrect-review demotion only.

Correct normal reviews continue to advance according to the normal stage progression.

---

# SRS Interval

Provide separate controls.

```text
SRS Interval — Grammar

[ Default ▼ ]
```

```text
SRS Interval — Vocabulary

[ Default ▼ ]
```

Options:

```text
Shortest
Shorter
Default
Longer
Longest
```

---

## Important Future-Only Rule

Changing SRS Interval does **not** recalculate reviews already scheduled.

The Settings UI should explicitly explain:

```text
Changing your SRS interval only affects reviews scheduled from this point forward.

Reviews that already have a due time keep their existing due time.
```

Example:

```text
Current review due:
October 12

User changes:
Default → Longest

October 12 due date remains unchanged.
```

After the learner completes that review:

```text
the newly calculated Longest interval applies
```

This applies to Grammar and Vocabulary.

---

## Level 3+ Standard Intervals

The customizable standard schedule applies to normal non-accelerated Levels.

Use:

| Current Stage | Shortest |   Shorter |  Default |    Longer |  Longest |
| ------------- | -------: | --------: | -------: | --------: | -------: |
| Beginner 1    |  4 hours |   4 hours |  4 hours |   4 hours |  4 hours |
| Beginner 2    |  8 hours |   8 hours |  8 hours |   8 hours |  8 hours |
| Beginner 3    | 12 hours |  18 hours | 24 hours |  30 hours | 36 hours |
| Beginner 4    |   2 days |    2 days |   2 days |    2 days |   2 days |
| Familiar 1    |   5 days |    6 days |   7 days |    8 days |   9 days |
| Familiar 2    |   1 week | 1.5 weeks |  2 weeks | 2.5 weeks |  3 weeks |
| Intermediate  |  2 weeks |   3 weeks |  4 weeks |   5 weeks |  6 weeks |
| Master        | 2 months |  3 months | 3 months |  5 months | 6 months |

Only these stages vary with the selected interval mode:

```text
Beginner 3
Familiar 1
Familiar 2
Intermediate
Master
```

These remain fixed:

```text
Beginner 1
Beginner 2
Beginner 4
```

---

## Default Schedule Change

The new Default schedule is therefore:

```text
Beginner 1 → Beginner 2
4 hours

Beginner 2 → Beginner 3
8 hours

Beginner 3 → Beginner 4
24 hours

Beginner 4 → Familiar 1
2 days

Familiar 1 → Familiar 2
7 days

Familiar 2 → Intermediate
2 weeks

Intermediate → Master
4 weeks

Master → Fluent
3 calendar months
```

This intentionally changes the old:

```text
Master → Fluent
4 months
```

default to:

```text
Master → Fluent
3 calendar months
```

Update the authoritative SRS configuration and project documentation together.

Do not leave the old four-month Master interval functioning as an undocumented alternate default.

---

## Level 1–2 Acceleration

Keep the current accelerated early-Level schedule.

For curriculum Levels 1 and 2:

```text
Beginner 1 → Beginner 2
2 hours

Beginner 2 → Beginner 3
4 hours

Beginner 3 → Beginner 4
8 hours

Beginner 4 → Familiar 1
1 day
```

These accelerated early intervals do not change based on:

```text
Shortest
Shorter
Default
Longer
Longest
```

For Levels 1–2, once the learner reaches Familiar 1, use the selected standard preference.

Example:

```text
Level 1 learner
Interval = Longest

Beginner 1    2 hours
Beginner 2    4 hours
Beginner 3    8 hours
Beginner 4    1 day

Familiar 1    9 days
Familiar 2    3 weeks
Intermediate  6 weeks
Master        6 months
```

---

## Duration Semantics

Hours/days/weeks are duration-based.

Use:

```text
1 day = 24 hours
1 week = 7 days
1.5 weeks = 10 days 12 hours
2.5 weeks = 17 days 12 hours
4 weeks = 28 days
```

Month-based values use calendar-month arithmetic.

Example:

```text
September 12 + 3 months
= December 12
```

not:

```text
September 12 + 90 days
```

Use calendar months for:

```text
2 months
3 months
5 months
6 months
```

---

# Review Queue Timing

Provide:

```text
Review Queue Timing

[ Start of Hour ▼ ]
```

Options:

```text
Start of Hour
Start of Day
```

Default:

```text
Start of Hour
```

This setting applies after the normal SRS interval is calculated.

Pipeline:

```text
review result
      ↓
new SRS stage
      ↓
selected Grammar/Vocabulary interval
      ↓
raw due time
      ↓
Review Queue Timing
      ↓
nextReviewAt
```

---

## Start of Hour

Round the calculated due timestamp forward to the next hour boundary.

Example:

```text
4:37 PM
→ 5:00 PM
```

If already exactly on the hour:

```text
4:00 PM
→ 4:00 PM
```

---

## Start of Day

Take the calculated review's calendar date in the learner's configured timezone and align it to:

```text
12:00 AM
```

Example:

```text
raw due time:
September 18, 3:40 PM

timezone:
America/Phoenix

Start of Day:
September 18, 12:00 AM
```

Use timezone-safe date handling.

Do not align Start-of-Day using server UTC midnight.

---

# Fluent Mode

Provide separate toggles:

```text
Fluent Mode — Grammar             [toggle]
Fluent Mode — Vocabulary          [toggle]
```

Default:

```text
ON
```

---

## Fluent Mode On

When an item reaches Fluent:

```text
Fluent
      ↓
next review in 6 calendar months
```

When that Fluent maintenance review is answered correctly:

```text
remain Fluent
      ↓
next review in 6 calendar months
```

This continues indefinitely while Fluent Mode remains enabled.

---

## Fluent Mode Off

When an item reaches Fluent with Fluent Mode disabled:

```text
Fluent
      ↓
nextReviewAt = null
```

Fluent is terminal.

---

## Incorrect Fluent Review

An incorrect Fluent review uses the learner's normal SRS Strictness.

Examples:

```text
Fluent
Strictness = 1 Stage
incorrect
→ Master
```

```text
Fluent
Strictness = Full
incorrect
→ Beginner 1
```

After leaving Fluent, normal configured SRS scheduling resumes.

---

## Existing Fluent Items

When Fluent Mode is introduced or enabled, existing Fluent items with:

```text
nextReviewAt = null
```

must receive a maintenance schedule based on when they became Fluent.

Use:

```text
fluentAt + 6 calendar months
```

Do not use:

```text
settingChangedAt + 6 months
```

Example:

```text
Reached Fluent:
January 1

Fluent Mode turned on:
May 1

Next review:
July 1
```

not:

```text
November 1
```

If:

```text
fluentAt + 6 months
```

is already in the past, the item is ready in the review queue immediately.

---

## Turning Fluent Mode Off

When Fluent Mode is disabled:

```text
currently Fluent items
whose next review exists only because of Fluent maintenance
→ nextReviewAt = null
```

Do not modify:

```text
non-Fluent scheduled reviews
```

---

# SRS Server Ownership

All SRS calculations remain server-side.

React must never calculate authoritative:

```text
stageAfter
nextReviewAt
Fluent scheduling
leech status
Ghost stage
```

The review pipeline should conceptually become:

```text
normal review outcome
      ↓
signed session preferences
      ↓
SRS Strictness
      ↓
stage transition
      ↓
Grammar/Vocabulary Interval Mode
      ↓
raw next-review timestamp
      ↓
Review Queue Timing
      ↓
Fluent behavior if applicable
      ↓
update progress
      ↓
update leech aggregates
      ↓
Ghost trigger if applicable
      ↓
write review event
      ↓
evaluate level unlock
      ↓
commit
```

Reuse the existing atomic review-completion transaction.

Do not create a second configurable-review implementation.

---

## Atomic Review Updates

A completed normal review should atomically update where applicable:

```text
SRS stage
nextReviewAt

correct count
incorrect count

current correct streak
highest SRS stage reached

review event

Ghost trigger/update

level unlock
```

If the transaction fails:

```text
none of those changes commit
```

---

# Appearance

Appearance settings are the exception to the general server-settings rule.

They are not authoritative learning data.

They may be client-side/device-local.

Appearance does not affect:

```text
SRS
review eligibility
curriculum
progress
streak
authorization
```

---

## Appearance Persistence

Use a versioned browser-storage key such as:

```text
polyglot:appearance:v1
```

Conceptually persist:

```text
theme
palette
fontFamily
fontScale
colorBlindAssistance
```

Apply appearance at the application-shell/document level through:

```text
CSS variables
data attributes
document class
```

Do not add individual appearance conditionals throughout application components.

---

## Avoid Theme Flash

Apply saved theme preference before normal hydration where practical.

Avoid:

```text
light UI appears
      ↓
React hydrates
      ↓
dark UI appears
```

Use a small early appearance bootstrap or equivalent best-practice approach.

Appearance may remain device-specific rather than syncing between devices.

---

## Theme

Provide:

```text
Appearance

○ System
○ Light
○ Dark
```

Default:

```text
System
```

`System` follows:

```text
prefers-color-scheme
```

Use the existing semantic light/dark token system.

Do not rebuild component colors independently.

---

## Color Palette / Accent

Provide several curated palette/accent options.

Do not initially support arbitrary user-entered hex colors.

When a palette is selected, show a live miniature dashboard preview.

Conceptually:

```text
┌────────────────────────────────┐
│                                │
│  ┌─────────┐  ┌────────────┐   │
│  │         │  │            │   │
│  └─────────┘  └────────────┘   │
│                                │
│  ┌──────────────────────────┐  │
│  │                          │  │
│  └──────────────────────────┘  │
│                                │
└────────────────────────────────┘
```

The three blank cards should change appearance as the learner chooses different palettes.

Palette may affect:

- primary accent
- main buttons
- links
- selected tabs
- decorative backgrounds
- non-semantic highlights
- charts where appropriate

Palette must not redefine meaning-bearing semantic colors.

Keep semantic identity for:

```text
Vocabulary
Grammar

Beginner
Familiar
Intermediate
Master
Fluent

Success
Warning
Error
```

A color palette should not make:

```text
Grammar
```

stop meaning Grammar.

---

## Font Family

Provide three curated choices:

```text
Polyglot / Cozy
Formal
Standard
```

The exact fonts may be selected during implementation.

Use the current written/cozy Polyglot font/style as the default.

Every selectable font must have appropriate glyph coverage for Polyglot languages.

Do not expose a font that works for Latin characters but breaks future:

```text
Japanese
Tagalog
other language scripts
```

where relevant.

Apply font family through centralized typography variables/tokens.

---

## Font Size

Provide:

```text
Small
Default
Large
Extra Large
```

Show a live preview to the right/on the same page.

Example:

```text
Example Header

This is normal Polyglot body text.
It changes as the selected text size changes.
```

Font sizing should adjust:

- normal text
- headings
- labels

using designed scaling ratios.

Do not assign one identical pixel multiplier to every piece of typography.

The largest supported size must remain usable without horizontal overflow.

---

## Color-Blind Assistance

Provide:

```text
Color-Blind Assistance            [toggle]
```

Default:

```text
OFF
```

Show an explanatory visual preview underneath.

Color-blind assistance must strengthen non-color cues.

Use:

- icons
- labels
- shapes
- borders
- patterns where useful
- stronger contrast

Do not merely replace one color palette with another while continuing to encode state using color alone.

Examples:

```text
Vocabulary
◆ VOCAB

Grammar
■ GRAMMAR

Correct
✓ Correct

Incorrect
× Incorrect
```

Continue following Polyglot's existing rule that important meaning cannot be represented by color alone.

---

# Subscription

Show:

```text
Subscription

Coming Soon
```

Do not create fake:

```text
plan
renewal date
trial date
usage statistics
billing state
```

until a real subscription system exists.

Do not create Stripe-specific schema solely for this placeholder.

---

# Notifications

Store notification preferences now.

The actual optional email-delivery provider/workflow is deferred.

Do not send fake/nonexistent emails simply because a toggle exists.

All optional email preferences default:

```text
ON
```

---

## Email

### News & Updates

```text
News & Updates                    [toggle]
```

Default:

```text
ON
```

Controls optional Polyglot news/product-update email.

---

### Progress Email

```text
Progress Email                    [toggle]

Receive a progress and review summary every two weeks.
```

Default:

```text
ON
```

The eventual email may include:

```text
review stats
lesson progress
streak
Level progress
review accuracy
other defined progress statistics
```

No email is sent until the future notification-delivery system exists.

---

### Inactivity Email

```text
Inactivity Email                  [toggle]

Receive an encouragement email after being inactive.
```

Default:

```text
ON
```

The exact inactivity duration can be decided when the email workflow itself is implemented.

Do not create timing/background infrastructure in this Settings feature just to make the preference exist.

---

### Trial Emails

```text
Trial Emails                      [toggle]

Receive optional emails about trials and reminders before a trial ends.
```

Default:

```text
ON
```

No trial-specific messages are sent until subscription/trial infrastructure exists.

---

### Transactional Emails

Display informational text only.

No toggle.

Example:

```text
Transactional Emails

Account-security, email/password changes,
billing, subscription, and other required
transactional messages cannot be disabled.
```

---

## Notification Persistence

Recommended:

```text
user_notification_preferences

user_id
news_updates
progress_email
inactivity_email
trial_email
updated_at
```

Absence of a row resolves to all:

```text
true
```

for these optional categories.

---

# API

Show:

```text
API

Coming Soon
```

Do not create:

```text
API keys
API secrets
scopes
usage tables
API rate-plan data
```

for this placeholder.

---

# Danger Zone

The Danger Zone appears visually separate from normal settings.

Use destructive styling only where appropriate.

Every Danger Zone action requires an explicit confirmation modal.

No destructive mutation occurs merely because the learner changed a dropdown.

Server-side confirmation remains authoritative.

Danger Zone operations should use:

- authenticated internal user
- rate limiting
- idempotency
- transactions where multiple records are affected

---

## Reset Grammar

Provide:

```text
Reset Grammar

[ Main Reviews ▼ ]

[Reset]
```

Options:

```text
Main Reviews
Ghost Reviews
Leech Reviews

A1
A2
B1
B2
C1
C2
```

Pressing Reset opens a confirmation dialog describing exactly what will happen.

---

## Reset Vocabulary

Provide:

```text
Reset Vocabulary

[ Main Reviews ▼ ]

[Reset]
```

Options:

```text
Main Reviews
Ghost Reviews
Leech Reviews

A1
A2
B1
B2
C1
C2
```

Use the same underlying reset service with item-type filters.

Do not implement separate unrelated reset logic for vocabulary and grammar.

---

## Main Reviews Reset

Selecting:

```text
Main Reviews
```

resets the selected content type's current normal SRS progress.

For each affected item:

```text
current stage
→ Beginner 1
```

Reset current SRS aggregate state as appropriate:

```text
correct count
incorrect count
review count
current correct streak
highest SRS stage reached
next review schedule
Fluent maintenance schedule
```

The item remains learned/enrolled.

Retain durable history:

```text
review_events
```

Retain:

```text
learner notes
user synonyms
deck references
curriculum identity
learnedAt
```

The reset schedules a new Beginner 1 review from the reset time using the normal effective schedule.

Example Level 5 item:

```text
Beginner 1
→ next review in 4 hours
```

Example accelerated Level 1 item:

```text
Beginner 1
→ next review in 2 hours
```

---

## Ghost Reviews Reset

Selecting:

```text
Ghost Reviews
```

removes the learner's active/dormant Ghost Review state for that selected content type.

It may remove:

```text
ghost stage
ghost next review
minimal-mode miss tracking
```

for those Ghosts.

It does not change the normal vocabulary/grammar SRS stage.

Example:

```text
Vocabulary item:
Master

Ghost sentence:
Ghost 3
```

Reset Vocabulary → Ghost Reviews:

```text
Vocabulary remains Master.
Ghost removed.
```

---

## Leech Reviews Reset

Selecting:

```text
Leech Reviews
```

finds the selected content type's currently Leech-classified items.

Those affected normal learning items reset to:

```text
Beginner 1
```

using the same current-progress reset behavior as Main Reviews.

Their current Leech aggregate counters are reset.

Historical review events remain.

This gives the learner a fresh current SRS/leech state without rewriting history.

---

## CEFR Reset

Selecting:

```text
A1
A2
B1
B2
C1
C2
```

filters the selected item type to that CEFR band.

Example:

```text
Reset Grammar
A2
```

means:

```text
all A2 Grammar current SRS progress
→ Beginner 1
```

while:

```text
Vocabulary
A2
```

is unaffected.

Historical review events remain.

Use the curriculum's authoritative CEFR/Level mapping rather than hardcoding Spanish-specific item IDs into the reset service.

---

## Reset to Level

Provide:

```text
Current Level
Level 10

Reset to Level

[ Level 6 ▼ ]

[Reset]
```

The dropdown contains:

```text
current Level
every preceding Level
```

Never offer a future locked Level.

Default selection may display the current Level.

Disable the destructive action until the learner selects an earlier Level if resetting to the current Level would be a no-op.

Example:

```text
Current:
Level 10

Reset to:
Level 6
```

The reset:

- removes current item progress above Level 6
- removes Level unlocks above Level 6
- removes Ghost state tied to removed progress
- returns the learner's effective current Level to Level 6

Retain durable review-event history.

Do not fabricate historical data to pretend the learner never studied the removed Levels.

Personal/theme Deck visibility should naturally follow the existing learned-item eligibility rules after progress is removed.

Do not manually rewrite every Deck solely for this reset.

---

## Manually Set Streak

Provide:

```text
Manually Set Streak

[ 25 ]

[Set Streak]
```

Require confirmation.

Do not insert fake review events.

Store an explicit streak adjustment/base record.

Example:

```text
Manual streak:
20
```

Then:

```text
next qualifying active day
→ 21

following qualifying day
→ 22
```

If the learner later genuinely breaks their streak:

```text
→ 0
```

Vacation-neutral days:

```text
do not increment
do not break
```

Streak calculation must remain centralized in the authoritative streak domain/read model.

Do not calculate the final streak independently in dashboard React components.

---

## Streak Persistence

Conceptually support:

```text
user_streak_adjustments

id
user_id
value
created_at
updated_at
```

or another normalized equivalent.

The authoritative streak calculation combines:

```text
actual qualifying learning/review days
+
vacation-neutral periods
+
current manual streak adjustment
```

without modifying review history.

---

## Reset Dismissable Warnings

Provide:

```text
Reset Dismissable Warnings

Show all messages you previously marked:
"Don't show this message again."

[Reset Warnings]
```

Persist dismissed warnings with stable semantic keys.

Conceptually:

```text
user_dismissed_notices

user_id
notice_key
dismissed_at
```

Use:

```text
UNIQUE(user_id, notice_key)
```

Do not use the English UI copy itself as the identifier.

Example good key:

```text
VACATION_LESSON_WARNING
```

not:

```text
"Are you sure you want to start a lesson while on vacation?"
```

Reset removes the authenticated user's dismissal records.

---

## Reset Entire Account

Provide:

```text
Reset Entire Account

Return your Polyglot learning account to a fresh state.

[Reset Account]
```

Use a strong confirmation dialog.

Make the dialog clearly distinguish:

```text
Reset Entire Account
```

from:

```text
Delete Account
```

Reset Entire Account keeps the external identity/login.

Retain:

```text
Clerk identity
login email
password/login credentials
active subscription/billing relationship when applicable
```

Reset all Polyglot learner/application state.

Remove/reset:

- lesson progress
- SRS progress
- review-event history
- Ghost Reviews
- Leech aggregate state
- Level unlocks
- curriculum preferences
- lesson preferences
- review preferences
- notification preferences
- personal Decks
- personal Deck membership
- private notes
- personal synonyms
- private examples
- Vacation history
- streak adjustments
- dismissed warnings
- Polyglot username
- onboarding completion
- other learner-specific application data

The learner should effectively return to:

```text
fresh Polyglot account
```

and must complete onboarding again.

Because Clerk identity remains, internal provisioning may repopulate identity-derived fields such as the learner's name after reset.

Do not retain old learning state merely because the same Clerk account remains.

This is intentionally broader than the existing development-only "reset progress" operation.

---

# Delete Account

Provide:

```text
Delete Account

Permanently delete your Polyglot account.

[Send Delete Confirmation Email]
```

The initial button does not immediately delete the account.

Use an authenticated confirmation workflow.

Prefer the identity provider's supported secure verification/email mechanisms where possible.

Do not store a plaintext deletion token.

If Polyglot must own a token, store only a secure hash and use an expiring one-time token.

---

## Delete Confirmation

The email/verification flow confirms the deletion request.

After confirmation:

```text
account enters pending deletion
```

with a:

```text
7-day recovery period
```

Do not permanently delete immediately.

---

## Pending Deletion

Persist a deletion request.

Conceptually:

```text
account_deletion_requests

user_id
requested_at
confirmed_at
delete_after
cancelled_at
completed_at
```

After confirmation show:

```text
Your account is scheduled for deletion on September 19.

[Cancel Account Deletion]
```

The user may cancel at any time before `delete_after`.

Cancellation must be server-side and authenticated.

Do not automatically cancel deletion merely because the learner signs in.

Require explicit cancellation.

---

## Permanent Account Deletion

After seven days, a server-side scheduled process finalizes deletion.

Do not use:

```text
a client timer
an open browser tab
```

to perform permanent deletion.

Coordinate deletion across:

```text
Polyglot database
Clerk identity
future billing/subscription systems
```

Deletion must be idempotent.

Do not leave an intentional permanent state where:

```text
Clerk login exists
but Polyglot account was permanently removed
```

or:

```text
Polyglot learner remains active
but identity no longer exists
```

Any future data that legally/operationally must be retained after account deletion must be explicitly documented rather than silently exempted.

---

# Appearance vs Server Settings

Appearance is intentionally different.

These may be client-side:

```text
theme
palette
font
font sizing
color-blind assistance
```

Everything that can change application behavior remains server-side.

Do not client-store authoritative values for:

```text
timezone
Vacation Mode
curriculum mode
lesson batch size
review type
Ghost mode
leech minimum SRS
SRS strictness
SRS interval
Fluent Mode
streak
NSFW access
notification preferences
account resets
```

---

# Server-Side Settings Reads

Learner-facing features should ask their owning domain for effective settings.

Examples:

```text
Lessons
→ effective lesson preferences

Reviews
→ effective review preferences

SRS completion
→ signed review-session SRS preferences

Dashboard
→ authoritative timezone/streak behavior

Curriculum reads
→ authoritative NSFW preference
```

Do not make every React page manually query the settings tables.

Build reusable server-side settings/domain read helpers.

---

# Settings and Active Sessions

### Lesson Session

Changing:

```text
curriculum mode
grammar placement
batch size
```

does not modify an already-open lesson session.

It affects the next generated lesson.

### Review Session

Changing:

```text
review type
SRS strictness
SRS interval
queue timing
Fluent Mode
```

does not alter an already-started signed review session.

It affects the next review session.

This prevents behavior changing halfway through a session.

---

# Settings Data Model

Extend the current schema additively.

Conceptually:

```text
users
  display_name
  username
  timezone
  ...

user_preferences
  user_id
  hide_english_reviews
  show_nsfw_content
  ...

user_language_settings
  user_id
  language_id

  curriculum_mode
  selected_vocabulary_group_id

  grammar_placement
  lesson_batch_size
  auto_pronounce_lessons

user_review_preferences
  user_id
  language_id

  grammar_review_type
  vocabulary_review_type

  grammar_ghost_mode
  vocabulary_ghost_mode

  grammar_minimum_leech_stage
  vocabulary_minimum_leech_stage

  grammar_hint_order
  grammar_hint_mode

  vocabulary_hint_order
  vocabulary_hint_mode

  autoplay_audio
  lightning_mode
  focus_mode
  auto_highlight_errors
  show_srs_stage
  auto_expand_info
  undo_action

  grammar_srs_strictness
  vocabulary_srs_strictness

  grammar_interval_mode
  vocabulary_interval_mode

  review_queue_timing

  grammar_fluent_mode
  vocabulary_fluent_mode

user_notification_preferences
  user_id
  news_updates
  progress_email
  inactivity_email
  trial_email

user_vacation_periods
  ...

user_sentence_ghost_progress
  ...

user_dismissed_notices
  ...

user_streak_adjustments
  ...

account_deletion_requests
  ...
```

Use enums or constrained text values for closed configuration sets where appropriate.

Do not add columns only because a setting conceptually exists if the current domain already stores the authoritative information elsewhere.

---

# Review Preference Values

Recommended enum/config values:

```text
review_type

cloze_manual
cloze_flashcard
flashcard
```

```text
ghost_mode

on
minimal
off
```

```text
hint_order

nuance_first
translation_first
```

```text
hint_mode

hide
hint
show
more
always_show_nuance
```

```text
srs_strictness

one_stage
two_stages
three_stages
half
full
```

```text
srs_interval_mode

shortest
shorter
default
longer
longest
```

```text
review_queue_timing

start_of_hour
start_of_day
```

Use application-level types derived from one canonical definition.

Do not maintain a different string set in React and server logic.

---

# Curriculum Preference Values

Recommended new values:

```text
default_order
choose_group
variety
```

Migrate/remove old values after compatibility is no longer required.

Do not leave:

```text
theme
random
balanced
```

and the new three modes operating as two separate systems.

---

# Grammar Placement Values

Use:

```text
first
last
no_preference
```

Remember:

```text
Default Order
→ grammar placement ignored
→ grammar always first

Choose Group as You Go
→ grammar placement ignored

Variety
→ grammar placement applies
```

---

# Settings Mutations

Create thin server actions.

Conceptually:

```text
updateName
updateUsername

updateTimezone
updateContentPreferences

enableVacationMode
disableVacationMode

updateCurriculumPreference
updateGrammarPlacement
updateLessonBatchSize
updateLessonAudioPreference

updateReviewTypes
updateGhostPreferences
updateLeechPreferences
updateHintPreferences
updateReviewUiPreferences
updateSrsStrictness
updateSrsInterval
updateReviewQueueTiming
updateFluentMode

updateNotificationPreferences

resetGrammarProgress
resetVocabularyProgress
resetToLevel
setManualStreak
resetDismissedWarnings
resetEntireAccount

requestAccountDeletion
cancelAccountDeletion
```

Do not create one generic action that accepts arbitrary setting names/values from the browser without typed validation.

---

# Cache / UI Synchronization

After successful server setting changes, invalidate/revalidate the necessary application data.

A saved setting should be reflected on:

```text
page reload
navigation
new tab
another signed-in device
```

for all server-side settings.

Use the project's existing Next.js cache/revalidation strategy.

Do not rely on a client context as the only source of a saved server preference.

Appearance settings are intentionally device-local and do not have to sync across browsers/devices.

---

# Name Synchronization

Name changes should not leave:

```text
Clerk name = Jacob
Polyglot name = Jake
Dashboard greeting = Jacob
Admin audit display = Jake
```

without an intentional distinction.

For this feature, the chosen Name is one synchronized learner identity/display name.

The Polyglot internal value should become the application-facing display source after synchronization.

---

# Username Concurrency

Two users may attempt the same username simultaneously.

Database uniqueness must decide the winner.

Handle the unique violation as a clean:

```text
That username is already taken.
```

error.

Do not use:

```text
check available
then insert
```

as the only protection.

---

# NSFW Security

NSFW visibility is not a client-only filter.

Do not return restricted content to an opted-out learner and merely hide it with CSS.

Learner-facing server reads should filter it before it becomes page data where practical.

Admin/Writer curriculum surfaces continue to show classified content as appropriate for their authoring responsibilities.

NSFW preference must never weaken normal role authorization.

---

# Vacation Concurrency

Enabling Vacation Mode twice should not create duplicate active periods.

Disabling it twice should not shift review due dates twice.

The enable/disable operations must be idempotent.

Schedule adjustment at vacation end must happen exactly once.

---

# SRS Migration

This feature changes existing SRS policy.

### Incorrect penalties

Old:

```text
Beginner
→ -1

Familiar+
→ -2
```

New default:

```text
all stages
→ -1
```

Existing item stages remain untouched during migration.

Only future review outcomes use the new default.

---

## Interval Migration

Do not rewrite existing `nextReviewAt` values when deploying the new interval table.

Existing scheduled reviews keep their dates.

The new table applies the next time a review schedules a new due date.

Update the central SRS configuration so the new Default becomes authoritative.

---

## Fluent Migration

Existing Fluent items may currently have:

```text
nextReviewAt = null
```

because Fluent was terminal.

With Fluent Mode defaulting ON, reconcile those items using:

```text
fluentAt + 6 calendar months
```

This operation must be idempotent.

Do not duplicate six-month schedules if the migration/reconciliation runs twice.

---

# Ghost Migration

Ghost Reviews are new.

No historical normal review event should automatically create hundreds of old Ghosts retroactively.

Ghost creation starts from reviews completed after the Ghost system is deployed/enabled.

Historical review data may be used for leech migration but not retroactive Ghost generation.

---

# Leech Migration

Current durable review history may be used to initialize:

```text
currentCorrectStreak
highestSrsStageReached
```

and validate existing:

```text
incorrectCount
```

where practical.

Do not fabricate review history.

After migration, keep the aggregate fields correct transactionally during new reviews.

---

# Danger Zone History Rules

Normal reset operations preserve durable historical review events.

This includes:

```text
Main Reviews reset
Leech Reviews reset
CEFR reset
Reset to Level
```

Ghost Reset deletes current supplemental Ghost state.

Reset Entire Account is different:

```text
fresh account
```

and removes learner application history as part of the full application reset.

Delete Account ultimately removes the entire account according to the deletion workflow.

---

# Accessibility

All Settings controls must be accessible.

Requirements include:

- keyboard navigation
- visible focus
- proper labels
- screen-reader state for switches
- accessible dropdowns
- modal focus trapping
- focus restoration after dialogs
- touch-friendly controls
- no color-only state
- reduced-motion respect
- no horizontal overflow at maximum font size

Danger Zone confirmations must clearly identify:

```text
what will be deleted/reset
what will remain
```

before confirmation.

---

# Responsive Behavior

Desktop:

```text
persistent sidebar
content panel
```

Tablet/mobile:

```text
responsive settings navigation
single-column settings content where needed
```

Appearance previews may move below the controls on narrow layouts.

SRS interval tables must remain readable on mobile.

Use:

```text
responsive table/container
horizontal scrolling only where necessary
clear row/column headers
```

Do not shrink interval values until they become unreadable.

---

# Performance

Settings pages should read only the settings required for the current section.

Do not load:

```text
every setting
all review history
all curriculum
all progress
```

just to render `/settings/account`.

Use server-side read models per Settings section.

Avoid N+1 settings reads.

A normal settings page load should require a small bounded number of database queries.

---

# Domain Ownership

Settings controls preferences.

The owning domains continue to own behavior.

Examples:

```text
Settings
→ stores lesson preference

domains/lessons
→ decides lesson selection
```

```text
Settings
→ stores SRS strictness

domains/srs
→ calculates stage change
```

```text
Settings
→ stores Vacation Mode

review/scheduling/streak domains
→ enforce the vacation behavior
```

Do not move SRS/curriculum logic into:

```text
components/settings/*
```

---

# Reuse Existing Architecture

Reuse existing:

- authenticated internal-user resolution
- `users.timezone`
- `user_language_settings`
- curriculum preference system
- lesson-selection service
- onboarding components
- pronunciation/audio provider
- review-session signing/orchestration
- SRS domain
- review events
- atomic review-completion transaction
- progress domain
- level-unlock logic
- dashboard/streak read models where applicable
- semantic color tokens
- Clerk integration
- rate limiting
- idempotency patterns

Do not create:

```text
Settings-specific SRS
Settings-specific curriculum selector
Settings-specific authentication
Settings-specific progress calculator
```

---

# Server / Client Module Boundaries

Keep secret/server-dependent settings code out of client bundles.

Follow the existing project convention:

```text
domain/index.ts
→ client-safe types/helpers

domain/server.ts
→ DB/auth/server functions
```

Do not create one barrel that re-exports server-only credential/db code and then value-import it into a Settings client component.

Client Settings components should receive safe values and call Server Actions.

---

# Subscription / Notifications / API Scope

These sections intentionally prepare navigation/layout without inventing functionality that does not exist yet.

### Subscription

```text
Coming Soon
```

### API

```text
Coming Soon
```

### Optional notification delivery

Preference storage only.

Do not silently expand Settings into:

```text
Stripe implementation
billing portal
public API
API-key management
SES/Resend/SendGrid integration
marketing-email infrastructure
```

Those are separate features.

---

# Practice Settings

Do not add a Practice Settings page yet.

Speaking, Listening, Reading, Writing, and other Practice systems should define their own real configurable behavior first.

Once those systems exist, `/settings/practice` can be added using the same Settings shell.

Do not fill Settings with controls that currently have no effect.

---

# Scope Limits

- no Spec number in the document title
- no Dashboard Tour until that feature exists
- no active Beta Mode until beta features exist
- no production subscription implementation
- no public API implementation
- no optional-email delivery provider
- no Practice settings before Practice features define their preferences
- no arbitrary custom SRS interval editor
- no arbitrary custom hex-color picker
- no Beginner 0 SRS stage
- no WaniKani Familiar+ multiplier penalty
- no client-authoritative SRS calculations
- no client-authoritative curriculum settings
- no client-authoritative Vacation Mode
- no client-authoritative NSFW filtering
- no rewriting historical review events when normal progress is reset
- no retroactive Ghost creation from old review history
- no duplicate lesson-selection implementation
- no duplicate review-completion implementation
- no second authentication/password database
- no one giant untyped settings JSON blob
- no fake email, subscription, API, or beta functionality

---

# Check When Done

- `/settings` exists and redirects to `/settings/account`.
- Desktop Settings uses a persistent sidebar.
- Mobile Settings has usable responsive navigation.
- Account, General, Lessons, Reviews, Appearance, Subscription, Notifications, API, and Danger Zone pages exist.
- Every non-Appearance authoritative setting is persisted server-side for the authenticated user.
- Appearance preferences persist client-side and never affect authoritative learning logic.
- Settings cannot modify another user's data by supplying another user ID.
- Narrow settings mutations prevent unrelated stale settings from overwriting each other.
- Saved server settings survive refresh and appear on another signed-in device.
- Appearance persists on the local browser/device.
- Name can be added/edited.
- Name synchronizes correctly with Clerk/internal Polyglot identity.
- `Welcome back ___` uses the synchronized Polyglot display name.
- Username can be edited.
- Username uniqueness is enforced case-insensitively by the database.
- Email change uses secure identity-provider verification.
- Password change never stores credentials in Neon.
- Beta shows Coming Soon.
- Onboarding Tour can be replayed without resetting onboarding/progress.
- Dashboard Tour is omitted.
- Timezone can be changed.
- Timezone affects stats/streak day boundaries.
- Timezone affects Start-of-Day Review Queue Timing.
- Historical event timestamps are not rewritten when timezone changes.
- Hide English affects Reviews only.
- NSFW content is hidden by default.
- NSFW filtering is server-side.
- NSFW curriculum/examples/dictionary content is excluded when disabled.
- Hidden NSFW content does not block Level progression.
- Vacation Mode is account-wide.
- Vacation Mode records real historical vacation periods.
- Normal Reviews freeze during Vacation Mode.
- Ghost Reviews freeze during Vacation Mode.
- Vacation days do not increase streak.
- Vacation days do not break streak.
- Already-ready reviews become ready immediately after Vacation Mode ends.
- Future reviews retain their remaining interval across Vacation Mode.
- Items learned during Vacation Mode preserve only the remaining vacation overlap.
- Lessons remain available during Vacation Mode after explicit warning.
- Learning Queue has Default Order, Choose Group as You Go, and Variety.
- Existing curriculum preferences migrate into the new model.
- Learning Queue changes affect future lessons only.
- Default Order teaches Grammar first.
- Default Order then follows vocabulary group order.
- Choose Group as You Go lets the learner choose vocabulary themes.
- Choose Group as You Go does not fill a short theme from another theme.
- Grammar Placement does not affect Choose Group as You Go.
- Variety distributes vocabulary across available groups.
- Variety respects Grammar Placement.
- No Preference never removes Grammar.
- Lesson batch-size choices include every integer from 3 through 15.
- Lesson batch size defaults to 6.
- Lesson auto-pronunciation works through the existing audio system.
- Grammar and Vocabulary Review Type can be configured separately.
- Cloze Manual uses typed server-checked answers.
- Vocabulary Cloze uses official example sentences.
- Vocabulary Cloze safely falls back when no sentence exists.
- Cloze Flashcard uses Reveal + Know/Don't Know.
- Flashcard uses Reveal + Know/Don't Know.
- Know is a correct SRS outcome.
- Don't Know is an incorrect SRS outcome.
- Active review sessions keep the settings with which they started.
- Ghost Reviews are separate from Leeches.
- Grammar Ghost Reviews support On, Minimal, Off.
- Vocabulary Ghost Reviews support On, Minimal, Off.
- Ghost On creates after the first sentence miss.
- Ghost Minimal creates after the same sentence is missed more than once.
- Ghost Off creates no new Ghosts.
- Ghost SRS intervals are 4h, 12h, 24h, 48h.
- Incorrect Ghost answers reset the Ghost to Ghost 1.
- Ghost progression never directly modifies normal item SRS.
- Ghost state is persisted per learner/sentence/item.
- Ghost queue respects Vacation Mode.
- Leech score uses `incorrectCount / max(correctStreak, 1)^1.5`.
- Leech requires score greater than 1.
- Grammar minimum-Leech SRS is configurable.
- Vocabulary minimum-Leech SRS is configurable.
- Minimum-Leech stage uses highest stage ever reached, not current stage only.
- Current correct streak updates transactionally with reviews.
- Ghost reviews do not affect Leech counters.
- Hint Order supports Nuance First and Translation First.
- Hint Mode supports Hide, Hint, Show, More, Always Show Nuance.
- Hide-English and explicit hint actions interact correctly.
- Review Autoplay Audio works.
- Lightning Mode advances automatically after correct answers.
- Focus Mode removes only nonessential UI.
- Auto Highlight Errors never overrides authoritative answer checking.
- Show SRS Stage changes presentation only.
- Auto-Expand Info works.
- Lightning Mode takes precedence over Auto-Expand after correct answers.
- Undo Action supports Clear All Characters.
- Undo Action supports Clear Last Character.
- Old Familiar+ automatic two-stage penalty is removed.
- Default incorrect SRS penalty is exactly one stage.
- Grammar SRS Strictness is configurable.
- Vocabulary SRS Strictness is configurable.
- 1 Stage works.
- 2 Stages works.
- 3 Stages works.
- Half uses floor(current stage position / 2).
- Full resets to Beginner 1.
- No result can go below Beginner 1.
- No Beginner 0 is introduced.
- Grammar SRS Interval is configurable.
- Vocabulary SRS Interval is configurable.
- SRS Interval offers Shortest, Shorter, Default, Longer, Longest.
- Changing interval preference never changes a review already scheduled.
- Level 3+ Beginner 3 intervals are 12h / 18h / 24h / 30h / 36h.
- Familiar 1 intervals are 5d / 6d / 7d / 8d / 9d.
- Familiar 2 intervals are 1w / 1.5w / 2w / 2.5w / 3w.
- Intermediate intervals are 2w / 3w / 4w / 5w / 6w.
- Master intervals are 2mo / 3mo / 3mo / 5mo / 6mo.
- Beginner 1 remains fixed at 4 hours on normal Levels.
- Beginner 2 remains fixed at 8 hours on normal Levels.
- Beginner 4 remains fixed at 2 days on normal Levels.
- Level 1–2 acceleration remains 2h / 4h / 8h / 1d for Beginner stages.
- Level 1–2 uses the selected interval preference from Familiar 1 onward.
- Month intervals use calendar months.
- Default Master → Fluent is now 3 calendar months.
- The old 4-month Master default is removed.
- Review Queue Timing supports Start of Hour.
- Review Queue Timing supports Start of Day.
- Start of Hour rounds forward correctly.
- Start of Day uses learner timezone midnight.
- Grammar Fluent Mode exists.
- Vocabulary Fluent Mode exists.
- Fluent Mode defaults On.
- Fluent maintenance reviews recur every six calendar months.
- Incorrect Fluent reviews respect configured SRS Strictness.
- Existing Fluent items use `fluentAt + 6 months`.
- Already-past Fluent maintenance dates become ready immediately.
- Turning Fluent Mode off removes only Fluent maintenance scheduling.
- SRS calculations remain server-side.
- Review completion remains atomic and idempotent.
- Ghost creation/update is atomic with the triggering normal review where applicable.
- Theme supports System, Light, Dark.
- Appearance changes without server-authoritative learning-state changes.
- Palette options show the miniature dashboard preview.
- Accent palettes do not replace semantic Vocabulary/Grammar/SRS/error colors.
- Three curated font families are provided.
- Fonts support required Polyglot character sets.
- Font sizes include Small, Default, Large, Extra Large.
- Font-size preview works.
- Maximum font size remains responsive.
- Color-Blind Assistance provides non-color state cues.
- Appearance survives refresh without an unnecessary theme flash.
- Subscription displays Coming Soon.
- API displays Coming Soon.
- News & Updates preference is stored.
- Progress Email preference is stored.
- Inactivity Email preference is stored.
- Trial Email preference is stored.
- All optional email preferences default On.
- Transactional Emails is informational and cannot be disabled.
- Notification preferences do not falsely send emails before email delivery exists.
- Danger Zone is visually separated.
- Every Danger Zone action requires explicit confirmation.
- Reset Grammar supports Main Reviews.
- Reset Grammar supports Ghost Reviews.
- Reset Grammar supports Leech Reviews.
- Reset Grammar supports A1–C2.
- Reset Vocabulary supports Main Reviews.
- Reset Vocabulary supports Ghost Reviews.
- Reset Vocabulary supports Leech Reviews.
- Reset Vocabulary supports A1–C2.
- Main Reviews reset returns current normal SRS state to Beginner 1.
- Main Reviews reset preserves durable review history.
- Ghost reset clears Ghost state without modifying normal SRS.
- Leech reset returns current Leech items to Beginner 1.
- CEFR resets affect only the selected item type and CEFR band.
- Reset to Level only offers current/previous Levels.
- Reset to Level cannot unlock/advance a learner.
- Reset to Level removes current progress above the target Level.
- Reset to Level preserves durable review history.
- Manual streak editing does not fabricate review events.
- Manual streak continues incrementing normally afterward.
- A genuinely broken streak resets the manual streak to zero.
- Vacation days do not alter the streak count.
- Reset Dismissable Warnings restores hidden warnings.
- Dismissed-warning records use stable notice keys.
- Reset Entire Account produces a genuinely fresh Polyglot learner state.
- Reset Entire Account retains external Clerk login identity.
- Reset Entire Account retains future active billing/subscription identity where required.
- Reset Entire Account removes Polyglot learning/preferences/history/personal content.
- Reset Entire Account requires onboarding again.
- Delete Account sends/starts a secure deletion-confirmation workflow.
- Confirmed account deletion enters a seven-day recovery period.
- Pending deletion can be explicitly cancelled.
- Permanent deletion runs server-side after the recovery period.
- Permanent deletion is idempotent.
- No destructive operation can affect another learner.
- Settings remain responsive and accessible.
- Server/client domain boundaries do not leak secrets into Settings client bundles.
- Existing curriculum, lessons, reviews, SRS, Clerk, and progress domain services are reused rather than duplicated.
- Tests pass.
- Integration tests pass.
- `npm run build` passes.
