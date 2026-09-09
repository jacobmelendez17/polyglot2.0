# Curriculum Decider & Level 1 Real Data

## Goal

After onboarding, let the learner choose how new curriculum items are introduced.

The three modes are:

* **Theme** — learner chooses a vocabulary theme and works through that theme
* **Random** — lesson batches randomly mix available vocabulary and grammar
* **Balanced** — lesson batches pull a little from each available vocabulary theme while grammar follows its configured curriculum order

All modes use the same curriculum and progression rules. They only change how new lesson material is selected.

## Onboarding Flow

After the final onboarding slide:

`Start Now!`

route the learner to the curriculum preference screen before entering the normal app.

Store the selected mode on the learner’s language-specific settings/profile.

Use values conceptually like:

```text
THEME
RANDOM
BALANCED
```

The preference can later be changed from Settings.

Changing modes affects future lesson generation only.

It must not modify:

* learned items
* SRS stages
* review schedules
* Level unlocks
* existing progress

## Theme Mode

The learner chooses which available vocabulary theme they want to study.

Lesson selection should stay inside that theme.

If the configured lesson batch size is larger than the number of remaining items in the selected theme, use only the remaining items.

Example:

```text
Batch size: 8
Remaining Family items: 1

Next lesson:
1 Family item
```

Do not fill the remaining seven positions from another theme.

After a theme is completed, the learner chooses another available theme.

Grammar continues according to its configured curriculum order and is not reorganized by the selected vocabulary theme.

## Random Mode

Build each new lesson from the available unlearned curriculum items in the current Level.

Randomize across:

* vocabulary
* grammar

Respect the existing lesson batch-size configuration.

Do not alter curriculum membership, SRS, or progression rules.

## Balanced Mode

Build lesson batches using a balanced mixture of available vocabulary themes.

Example with four themes and an eight-item vocabulary portion:

```text
Theme A: ~2
Theme B: ~2
Theme C: ~2
Theme D: ~2
```

Redistribute naturally when a theme has fewer remaining items.

Do not require perfectly equal counts when the remaining curriculum makes that impossible.

Grammar continues according to its configured curriculum order rather than being redistributed by vocabulary theme.

## Grammar

Curriculum mode primarily controls vocabulary selection.

Keep grammar sequencing authoritative to the existing grammar curriculum configuration.

Exception:

* Random mode may mix currently eligible grammar and vocabulary together in the lesson batch

Theme and Balanced modes must not scramble grammar progression.

## Level Progression

All modes eventually teach the same Level curriculum.

Do not change:

* Level requirements
* SRS algorithms
* unlock thresholds
* review behavior
* completion rules

A learner changing modes midway through a Level simply changes how the remaining unlearned items are selected.

## Settings

Add the curriculum preference to Settings.

Changing it should:

* persist immediately
* affect the next generated lesson session
* preserve all existing progress

Do not regenerate or mutate an already-active lesson session.

## Sandbox

Add the curriculum decider to the existing Admin/Developer Sandbox.

Allow:

* replaying the initial curriculum-choice screen
* switching between Theme, Random, and Balanced
* previewing lesson selection under each mode

Sandbox changes must not modify the real admin/developer learner preference or real progress.

Use the same production components and lesson-selection logic rather than creating a separate sandbox implementation.

## Level 1 Real Curriculum

Import the provided Level 1 CSV into the real curriculum database.

The CSV should create real Pending curriculum records using the existing curriculum schema.

Preserve:

* stable item identities
* Level
* batch/theme
* ordering
* vocabulary vs grammar type
* authored translations/content from the CSV

Do not use the CSV as a runtime data source.

After import, normal application reads must come from the database.

## Dictionary Review

Imported Level 1 vocabulary should enter the existing Lexicon/dictionary workflow.

After database intake:

* derive dictionary lookup forms
* attempt existing automatic dictionary matching
* auto-match only safe candidates
* send ambiguous/unmatched vocabulary to the existing review queue
* allow Admin mapping confirmation

Grammar items do not use dictionary mapping.

Importing or mapping Level 1 must not automatically publish it.

Curriculum remains Pending until Admin review/publication.

## Lesson Selection Service

Keep mode-specific selection logic centralized in the lesson/curriculum domain.

Do not implement separate selection algorithms directly inside React pages.

Conceptually:

```text
generateNextLesson(user, level, mode)
```

should use the learner’s remaining eligible curriculum and return the next lesson batch according to the selected mode.

Keep selection deterministic/testable where practical, especially for Theme and Balanced behavior.

## Scope Limits

* no new SRS behavior
* no changes to Level unlock rules
* no adaptive AI curriculum ordering
* no permanent per-theme progress system beyond existing item progress
* no CSV runtime loading
* no automatic curriculum publication
* no grammar dictionary integration

## Check When Done

* Curriculum decider appears immediately after onboarding.
* Theme, Random, and Balanced modes can be selected.
* Preference persists per learner/language.
* Preference can be changed from Settings.
* Switching modes only affects future lesson selection.
* Theme mode never fills a short theme batch using another theme.
* Random mode mixes eligible grammar and vocabulary.
* Balanced mode distributes vocabulary across themes.
* Grammar ordering remains authoritative outside Random mode.
* Existing SRS/progress/unlock behavior is unchanged.
* Sandbox can replay and test all modes without affecting real state.
* Level 1 CSV is imported into the real curriculum database.
* Level 1 vocabulary enters the existing dictionary review workflow.
* Grammar bypasses dictionary mapping.
* Imported curriculum remains Pending until publication.
* Tests pass.
* `npm run build` passes.
