# Decks Page

Add supplementary study decks using already-unlocked curriculum items.

Deck practice is completely separate from official curriculum progression and SRS.

## Deck Types

Support:

* **Polyglot Decks** — created by Admins only
* **Personal Decks** — created and managed by the current user

Both deck types reference existing canonical curriculum items. Do not duplicate vocabulary or grammar records.

Decks may contain:

* vocabulary
* grammar
* both

Users may only add curriculum items they have already unlocked.

Polyglot Decks cannot be modified by learners.

## Decks Page

Route:

`/decks`

Show:

* page title
* `Create Deck` button
* search
* type filter with `Vocabulary`, `Grammar`, and `Both`
* `Your Decks`
* `Polyglot Decks`

Use a responsive card grid.

Deck cards should show:

* icon/color
* deck name
* short description
* item count
* deck type

Clicking a card opens `/decks/[deckId]`.

If the user has no personal decks, continue showing Polyglot Decks normally.

If search/filter returns nothing, show a centered empty state explaining that no decks match the current query.

## Polyglot Deck Availability

Support two kinds of official decks:

### Level Decks

Level-based decks should remain hidden until that Level is unlocked.

Once available, they reference the curriculum items configured for that deck.

### Theme Decks

Theme-based decks may appear before every item in the theme is unlocked.

Only include items the learner has currently unlocked.

As additional matching curriculum items unlock, they automatically become available in the deck.

## Deck Detail

Route:

`/decks/[deckId]`

Show:

* deck name
* description
* item count
* `Practice Deck` action
* curriculum item list

Each item row should show:

* word / grammar point
* translation
* current SRS stage

For personal decks, also allow:

* rename
* edit description
* add unlocked items
* remove items
* reorder items
* delete deck

A deck cannot exist with zero items.

## Personal Deck Creation

Users can create personal decks with:

* name
* optional description
* one or more unlocked curriculum items

The same curriculum item may appear in multiple decks.

Users cannot add locked curriculum items.

Prevent saving a new deck or removing the final item if that would result in an empty deck.

## Practice

`Practice Deck` starts supplemental practice using existing Polyglot practice/question components.

Before starting, provide an optional:

`Know / Don't Know`

toggle.

When disabled, run normal deck practice.

When enabled, allow the learner to classify each practiced item as:

* Know
* Don't Know

Use existing mixed vocabulary practice types for vocabulary and existing configured grammar practice behavior for grammar.

Deck practice must not change:

* SRS stage
* next review time
* Level unlocks
* curriculum progress
* review statistics

`Know / Don't Know` results are session-only.

At the end, if enabled, show a summary such as:

```text
Deck Complete

Know: 18
Don't Know: 6
```

Allow the result list to be grouped by `Know` and `Don't Know`.

Do not permanently store this classification.

## Admin

Admins can create and manage official Polyglot Decks.

Official decks reference existing curriculum items.

Normal users can view and practice them but cannot:

* rename
* delete
* reorder
* add items
* remove items

## Scope Limits

* no deck sharing
* no public/community decks
* no deck marketplace
* no collaborative decks
* no CSV deck import
* no AI-generated decks
* no deck-specific SRS
* no permanent Know / Don't Know history
* no locked curriculum items in personal decks

## Check When Done

* `/decks` shows personal and Polyglot decks.
* Search works.
* Vocabulary / Grammar / Both filtering works.
* Users can create, edit, reorder, and delete personal decks.
* Empty decks cannot be created.
* Only unlocked items can be added to personal decks.
* Official decks cannot be modified by learners.
* Level decks remain hidden until their Level is unlocked.
* Theme decks dynamically expose unlocked matching items.
* Deck detail shows item, translation, and SRS stage.
* Vocabulary and grammar can coexist in a deck.
* Practice reuses existing practice behavior.
* Deck practice never changes official SRS or curriculum progress.
* Know / Don't Know is optional and session-only.
* Responsive and empty states work.
* Tests pass.
* `npm run build` passes.
