# Item Detail & Lesson Item Layout

## Goal

Redesign all curriculum item pages around one shared, polished layout inspired by the provided reference screenshots.

Use the same core presentation for:

- `/items/[itemId]`
- the information view shown while learning an item during a lesson

Vocabulary and grammar share the same shell but render type-specific content.

Keep the existing animated square/grid background visible around the content.

## Hero

At the top-left show:

```text
Grammar Info
A1 - Level 1 - 1/13
```

or:

```text
Vocabulary Info
A1 - Level 1 - 1/12
```

The main item should be large and centered with its primary translation/meaning beneath it.

Place large minimal previous/next arrows on the left and right sides of the hero.

### Normal Item Page

Grammar arrows cycle through all grammar items in the current Level.

Vocabulary arrows cycle through items in the current vocabulary theme/batch.

Navigation wraps:

```text
1/13 ← previous → 13/13
13/13 → next → 1/13
```

### Lesson Mode

Arrows only cycle through items belonging to the active lesson session.

Do not allow lesson navigation to escape the current session.

## Main Content Card

Below the hero, render one large content card with generous margins so the animated background remains visible around it.

At the top of the card show section navigation:

```text
Info
Examples
Progress
Resources
```

During lessons show only:

```text
Info
Examples
Resources
```

Tabs are anchor navigation, not separate mini-pages.

Clicking a tab smoothly scrolls to its section.

The active tab should update as the user scrolls.

## Sticky Item Header

Once the hero/item scrolls out of view, show a sticky header directly below the universal site header.

Left side:

```text
item
translation
```

Right side:

```text
Info | Examples | Progress | Resources
```

Hide `Progress` during lessons.

The sticky tabs use the same scroll-to-section behavior as the main tabs.

When this sticky header becomes active, also show a fixed:

`Back to Top`

button in the bottom-right.

Hide both when the hero is visible again.

## Info Summary Cards

At the top of Info, show four cards:

1. Details
2. Pronunciation
3. Synonyms
4. Variations

Desktop: four cards side-by-side.

Medium layouts: 2×2.

Mobile: stacked.

### Details

Grammar:

- Structure
- Register

Vocabulary:

- Gender
- Register

If vocabulary has no grammatical gender, display:

`N/A`

### Pronunciation

Show:

- clickable voice/audio icon
- learner-friendly pronunciation
- IPA
- Word Type

Reuse the existing audio/speech system.

The structure should allow imported pronunciation audio to replace or augment speech later.

### Synonyms

Show relevant dictionary/Polyglot synonyms.

Users may add private personal synonyms.

Personal synonyms continue to participate in that learner's answer checking where supported.

### Variations

Show lexical variants/forms where available.

Dictionary-derived information should resolve through the existing Lexicon system rather than being duplicated unnecessarily.

## About / Definition

Below the four summary cards, add a full-width nested card.

Vocabulary title:

`Definition`

Grammar title:

`About <grammar point>`

Vocabulary Definition contains Polyglot's learner-friendly teaching explanation while clearly distinguishing any Wiktionary-derived definitions/senses and attribution.

Admins edit Polyglot content, not raw imported Wiktionary records.

Dictionary mapping/sense changes continue through Lexicon controls.

## Grammar Content Blocks

Grammar About content should support three ordered block types:

### Text

Normal unbordered explanatory text.

### Example Sentence

An outlined example block containing:

- target-language sentence
- translation
- optional audio

### Polyglot Note

A highlighted note using yellow text/accent and an outline.

This is still fundamentally a text block.

Admins can:

- add
- edit
- delete
- reorder

these blocks from both the Item page and Admin curriculum editor.

Do not build a generic rich-text/page-builder system.

## Context

Below About/Definition, render a separate nested `Context` card.

Use a tabular presentation similar to the provided reference.

Left side:

`Pattern of Use`

and selectable pattern tabs/options.

Right side:

examples associated with the selected pattern.

Example:

```text
Pattern of Use        Common Combinations

[pattern 1]           example
[pattern 2]           translation
[pattern 3]

                      example
                      translation
```

Support Context for both vocabulary and grammar where configured.

Context patterns and examples must be Admin-editable.

## Examples

Render example sentences as clear full-width rows/cards.

Each example includes:

- target-language sentence
- translation beneath
- voice/audio button

Users may add their own private example sentences.

Private examples are visible only to that learner and do not modify official curriculum.

## Progress

Only show this section on the normal Item page.

Title:

`Your Progress`

Display:

```text
Current Stage
Next Review
Unlock Date
Accuracy
Times Studied
Retired Date
Leech
```

`Next Review` should display a useful time/date representation.

`Retired Date` displays `—` when not applicable.

Do not show `First Studied`.

Below the metrics, reserve a dedicated component area for the future animated SRS-stage visualization.

The placeholder/container should be replaceable later without restructuring the Progress section.

## Resources

Render Admin-authored external learning resources.

Resources should be organized cleanly as links/tabs where appropriate and open externally.

Do not mix user-private content with official resource links.

## Learner Actions

Place actions beneath their relevant sections rather than in one unrelated toolbar.

Support:

- Add personal synonym
- Add note
- Add personal example sentence
- Add to a Deck

Notes, personal synonyms, and personal examples are private learner content.

`Add to a Deck` should use the existing Deck system and only modify the learner's personal decks.

## Admin Editing

Admins can edit official item content directly from the Item page as well as through Admin Curriculum.

Use the same domain services and validation for both entry points.

Admin editing may include:

- Details metadata
- register
- word type
- grammar structure
- teaching definition/About content
- grammar content blocks
- Context patterns/examples
- official examples
- Resources

Do not maintain separate Item-page and Admin-page versions of the same business logic.

Lexicon-derived fields remain controlled through Lexicon mappings/selections.

## Data Model

Add only the structured fields/tables required by the current schema.

Potential additions include:

- register
- word type
- grammar content blocks
- block order/type
- context patterns
- context examples
- resource links

Prefer enums/configured types for values such as Register and Word Type where appropriate.

Keep content ordering explicit.

Use additive migrations only.

## Shared Implementation

Create shared Item Detail components used by both normal Item Detail and lesson presentation.

Conceptually:

```text
item-detail/
  item-hero
  item-navigation
  item-tabs
  sticky-item-header
  info-summary
  about-definition
  grammar-content-blocks
  context-section
  examples-section
  progress-section
  resources-section
  learner-actions
```

Lesson mode should configure this shared system rather than duplicating the page.

## Performance / UX

- use server-side item read models where possible
- avoid duplicate curriculum/Lexicon queries
- avoid N+1 example/resource loading
- use smooth scroll without blocking navigation
- use Intersection Observer or equivalent for sticky-header/tab tracking
- do not continuously update React state from scroll position unnecessarily
- preserve animated-background performance
- lazy-load heavier audio/content when appropriate
- keep responsive layouts usable at all supported widths

Follow existing accessibility, validation, authorization, and logging standards.

Respect reduced-motion settings for smooth scrolling/background animations where appropriate.

## Scope Limits

- no redesign of the universal header
- no new SRS algorithm
- no direct editing of raw Wiktionary data
- no generic rich-text editor
- no new audio provider
- no implementation of the final animated SRS visualization yet
- no public sharing of learner notes/synonyms/examples

## Check When Done

- Vocabulary and Grammar Item pages use the new shared layout.
- Lesson Item presentation reuses the same components.
- Large centered hero and animated background render correctly.
- Position indicator and wraparound arrows work.
- Lesson arrows remain inside the active lesson.
- Sticky header appears when the hero leaves view.
- Section tabs scroll and track the active section.
- Progress is hidden during lessons.
- Four Info cards render responsively.
- Grammar and vocabulary show the correct type-specific fields.
- Grammar supports Text, Example Sentence, and Polyglot Note blocks.
- Context supports configurable patterns and associated examples.
- Example audio works through the existing audio system.
- Learner synonyms, notes, and examples remain private.
- Add to Deck works with personal decks.
- Progress displays the required real learner data.
- Admins can edit official content from either Admin Curriculum or the Item page.
- Lexicon-derived content remains separated from Polyglot-authored content.
- `Back to Top` follows sticky-header visibility.
- Tests pass.
- `npm run build` passes.
