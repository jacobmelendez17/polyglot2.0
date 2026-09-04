# Spec 10 — Levels

## 1. Goal

Build the learner-facing curriculum browsing experience for Polyglot Levels 1–50.

The Levels experience has two connected pieces:

1. Replace the existing **Levels** navigation link with a dropdown containing Levels 1–50.
2. Build individual level pages that display every grammar and vocabulary item belonging to the selected level.

The Levels feature is primarily a curriculum-browsing interface.

Viewing a level or curriculum item does **not**:

* unlock the level
* enroll an item into SRS
* modify learner progress
* bypass lesson eligibility
* bypass normal curriculum progression

All displayed curriculum data must come from the real database-backed `curriculum` domain.

---

# 2. Routes

There is no standalone `/levels` landing page required.

Individual levels use:

```text
/levels/[level]
```

Examples:

```text
/levels/1
/levels/7
/levels/25
/levels/50
```

Valid values:

```text
1–50
```

Invalid values should return the normal not-found experience.

Do not create 50 individual hardcoded pages.

Use one dynamic route backed by curriculum data.

---

# 3. Header Levels Dropdown

The current **Levels** button in the signed-in desktop header should no longer navigate directly to a page.

Instead, clicking **Levels** opens a dropdown.

Desktop dropdown layout:

```text
Levels

 1   2   3   4   5   6   7   8   9  10
11  12  13  14  15  16  17  18  19  20
21  22  23  24  25  26  27  28  29  30
31  32  33  34  35  36  37  38  39  40
41  42  43  44  45  46  47  48  49  50
```

This is an exact:

```text
10 columns × 5 rows
```

grid on desktop.

Each level number is a link to:

```text
/levels/{number}
```

Example:

```text
Level 12 → /levels/12
```

The dropdown should remain visually compact rather than becoming a large navigation panel.

---

## 4. Header Dropdown Behavior

The dropdown should:

* open from the existing Levels navigation control
* close when a level is selected
* close when clicking outside
* close with `Escape`
* support keyboard navigation
* use the existing Polyglot visual language
* use rounded but compact level buttons
* clearly communicate hover/focus state
* avoid excessive decoration

If the learner is currently on a level page, the corresponding number may receive a subtle selected/current treatment.

Do not make selection dependent on color alone.

### Mobile

The mobile navigation should expose the same Levels 1–50 navigation.

It does not need to preserve the desktop 10-column layout if that would make touch targets unusable.

Use an appropriate responsive grid, such as fewer columns with more rows, while keeping every level reachable.

---

# 5. Level Page Structure

Route:

```text
/levels/[level]
```

The page should use nearly the full available width.

Unlike the dashboard's more constrained content areas, this page should have **small left and right margins** because it needs to display:

* the complete 50-level selector
* dense curriculum grids

Do not put the entire page inside a narrow centered column.

General structure:

```text
Level selector 1–50

Level 8                            [ view controls ]

Grammar                            [ collapse ]
[ cards................................. ]

Vocabulary                         [ collapse ]
[ cards................................. ]
```

Grammar appears first.

Vocabulary appears second.

---

# 6. Page-Level Selector

At the very top of every level page, display all 50 level numbers.

Example:

```text
1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 ...
```

The selector should be substantially denser than the header dropdown.

### Desktop goal

All 50 levels should normally fit within approximately:

```text
2–3 rows
```

on desktop.

Use the available horizontal screen width aggressively.

Avoid large horizontal margins or oversized level buttons that unnecessarily cause additional rows.

The exact number of columns should respond to available width rather than hardcoding a specific desktop column count.

---

## 7. Current Level State

The currently viewed level must be clearly identifiable.

Example:

```text
1  2  3  4 [5] 6  7  8 ...
```

Use:

* stronger border
* stronger surface
* font weight
* or another existing semantic treatment

Do not use color alone.

Clicking another level should navigate to that level's route.

Example:

```text
/levels/5
↓ click 12
/levels/12
```

Do not load all 50 levels' curriculum content simultaneously and hide 49 with client state.

The URL remains authoritative for the selected level.

---

# 8. Level Heading

Below the level selector, identify the current level.

Example:

```text
Level 8
```

Keep this useful but relatively compact.

The curriculum itself should remain the visual focus.

Avoid turning the heading into a large marketing-style hero.

---

# 9. Content Ordering

Within a level, display:

```text
Grammar
Vocabulary
```

in that order.

Each section consists of:

1. section header
2. collapse control
3. curriculum-item collection

Example:

```text
Grammar                                        ^
------------------------------------------------

[ grammar cards ]


Vocabulary                                     ^
------------------------------------------------

[ vocabulary cards ]
```

Both sections are expanded by default.

---

# 10. Collapsible Sections

Both:

```text
Grammar
Vocabulary
```

headers act as collapsible section controls.

Clicking the Grammar header/control collapses all grammar items.

Clicking Vocabulary collapses all vocabulary items.

Example:

```text
▼ Grammar

[ grammar cards ]

▼ Vocabulary

[ vocabulary cards ]
```

collapsed:

```text
▶ Grammar

▼ Vocabulary

[ vocabulary cards ]
```

The section title itself should remain visible when collapsed.

Use an appropriate chevron/icon to communicate state.

Implement using accessible expandable controls with:

```text
aria-expanded
```

and proper keyboard behavior.

---

# 11. Default Curriculum Grid

The default content view is a card grid.

On a normal desktop viewport, target:

```text
8 cards per row
```

The cards should be relatively dense because a normal level contains many items.

For the initial Spanish curriculum this will commonly mean approximately:

```text
12 grammar items
48 vocabulary items
```

when a full level follows the configured curriculum structure.

Do not assume these counts in the UI logic.

Render whatever published curriculum records belong to the selected level.

---

# 12. Curriculum Cards

Grammar and vocabulary both use the same general card shape.

Cards should be:

* slightly taller than they are wide
* moderately compact
* slightly rounded
* clearly clickable
* consistent across both content types
* comfortable enough to scan rapidly

Approximate visual character:

```text
┌───────────────┐
│               │
│     gato      │
│               │
│      cat      │
│               │
└───────────────┘
```

The card should not contain unnecessary metadata.

---

# 13. Vocabulary Card Content

Vocabulary card:

```text
gato
cat
```

Primary item:

* large
* visually dominant
* target-language text

Translation:

* smaller
* beneath the target-language item
* muted compared with the primary text

Example:

```text
┌───────────────┐
│               │
│     gato      │
│               │
│      cat      │
│               │
└───────────────┘
```

For nouns requiring an article, display the curriculum's actual learner-facing form.

Example:

```text
el gato
cat
```

Do not construct Spanish articles in the UI if the curriculum domain already provides the appropriate display information.

---

# 14. Grammar Card Content

Grammar uses the same visual structure.

Example:

```text
┌───────────────┐
│               │
│     porque    │
│               │
│    because    │
│               │
└───────────────┘
```

For conceptual grammar where a direct translation is inappropriate, use the grammar item's configured short learner-facing description.

Do not invent a translation client-side.

---

# 15. Grammar vs Vocabulary Styling

Grammar and vocabulary should remain visually distinguishable using the existing learning-category system.

Reuse existing semantic learning colors:

```text
--learning-grammar
--learning-vocabulary
```

The category treatment should remain restrained.

Suitable uses include:

* subtle card accent
* small category marker
* border treatment
* section heading treatment

Do not create unrelated new grammar/vocabulary colors.

Do not rely exclusively on color to distinguish item type.

The visible Grammar and Vocabulary section headings already provide primary context.

---

# 16. Card Interaction

The entire card is clickable.

Clicking a curriculum card navigates to that learning item's information page.

Conceptual route:

```text
/items/[itemId]
```

Example:

```text
/items/550e8400-e29b-41d4-a716-446655440000
```

The route should use the item's stable permanent identity rather than curriculum position.

Moving an item to another group or editing its display content must not break saved links.

The detailed item-information page itself is outside this spec unless it already exists when this feature is implemented.

If it does not exist yet, the Levels feature should still produce the correct link contract for the future Item Detail spec rather than duplicating item-detail content here.

---

# 17. View Controls

In the top-right area above the curriculum content, provide display controls.

The control supports:

```text
Larger cards
Default cards
Smaller cards
List
```

Icons may be used instead of displaying these full labels visually, but every control requires an accessible name/tooltip.

Conceptually:

```text
[ large grid ] [ normal grid ] [ compact grid ] [ list ]
```

Default:

```text
normal grid
```

---

# 18. Default Grid Size

Default card density:

```text
8 cards per row
```

on a normal desktop viewport.

This is the initial state when no learner display preference has been established.

---

# 19. Large Card Mode

Large mode should make curriculum cards easier to read and show fewer items per row.

Desktop target:

```text
approximately 6 cards per row
```

Do not rigidly require six when viewport width makes another responsive count more appropriate.

Maintain the slightly-taller-than-wide card shape.

---

# 20. Compact Card Mode

Compact mode should make the cards smaller and fit more items per row.

Desktop target:

```text
approximately 10 cards per row
```

The primary word and translation must remain readable.

Do not shrink cards below reasonable interaction/touch sizes simply to maximize density.

---

# 21. List View

List mode replaces the portrait card grid with a dense vertical list.

Example:

```text
Grammar

porque                         because
pero                           but
para                           for
de                             of / from
hay                            there is / there are
```

Vocabulary:

```text
el gato                        cat
el perro                       dog
la casa                        house
```

Each row remains clickable.

The row should clearly separate:

```text
primary item
translation / short description
```

Avoid adding extra columns or metadata that were not requested.

---

# 22. View Preference Behavior

Changing display mode must not change the current level.

Example:

```text
/levels/14
```

remains:

```text
/levels/14
```

whether the learner selects large, normal, compact, or list mode.

Display mode is non-authoritative UI state.

It may be stored as a small browser preference so moving between Level 4 and Level 5 does not unexpectedly reset the learner's chosen layout.

It must never affect curriculum or learner progress.

---

# 23. Responsive Behavior

## Wide desktop

Target:

* very small side margins
* 2–3 rows for the 50-level selector
* default 8 curriculum cards per row
* header dropdown uses exact 10×5 grid

## Smaller desktop / tablet

Reduce curriculum columns naturally.

Example:

```text
6
5
4
```

depending on space.

The level selector may use more than three rows when necessary.

## Mobile

Cards stack into an appropriate responsive grid.

Do not attempt to force:

```text
8 cards per row
```

on mobile.

Use a usable mobile density, likely:

```text
2–3 cards per row
```

depending on viewport and selected card size.

List mode should naturally become one full-width row per item.

No horizontal scrolling.

The Level 1–50 selector must remain usable without microscopic controls.

---

# 24. Curriculum Data

The page must use the real database-backed curriculum repositories created by the database foundation.

Fetch the selected:

```text
language
level
learning items
vocabulary details
grammar details
```

server-side.

Do not use the old lesson fixtures for this feature.

Only the current level's curriculum content should be fetched for normal rendering.

Avoid:

```text
load all 50 levels
→ load all 3,000+ learning items
→ filter in browser
```

Instead:

```text
selected level
→ server query
→ only that level's items
```

---

# 25. Language Isolation

The Level page always displays curriculum for the learner's active language.

Conceptually:

```text
active user
→ active language
→ Level 8
→ Level 8 curriculum for that language
```

Do not assume `"spanish"` throughout the components.

Additional languages should be able to reuse the same page structure.

The 1–50 level selector reflects Polyglot's current official curriculum model, while the content itself remains language-driven.

---

# 26. Browsing vs Progression

The Levels interface is a browsing interface.

Merely opening:

```text
/levels/30
```

must not:

* create `user_item_progress`
* unlock Level 30
* enroll Level 30 items
* modify lesson eligibility
* modify review state
* advance curriculum progress

Official progression continues to be controlled by lessons, SRS, and permanent unlock state.

If future product design visually distinguishes locked/unlocked levels, that presentation can read progress state without changing these rules.

---

# 27. Ordering

Grammar items should use their configured curriculum order.

Vocabulary should use its configured curriculum order.

Do not rely on:

* insertion order
* database IDs
* alphabetical ordering

unless curriculum configuration explicitly says to do so.

Expected page ordering:

```text
Grammar
  grammar item 1
  grammar item 2
  ...

Vocabulary
  group/item curriculum order
```

Vocabulary may come from several configured groups/themes, but this page does not need to visually split those groups unless a later design explicitly requests it.

For this spec, Vocabulary is one collapsible collection.

---

# 28. Loading State

The page should keep its overall layout stable while curriculum data resolves.

If a loading state is needed:

* preserve the level selector area
* use card-shaped skeletons
* approximate the selected grid density
* avoid full-page spinners

Do not briefly render fake curriculum content.

---

# 29. Empty States

Handle incomplete curriculum data safely.

### Level exists but Grammar is empty

Show the Grammar heading and an appropriate empty message when expanded.

Example:

```text
No grammar items have been published for this level yet.
```

Vocabulary may still render normally.

### Level exists but Vocabulary is empty

Use the corresponding Vocabulary empty state.

### Entire level has no published curriculum

Display the selected level normally and explain that curriculum content has not yet been published.

Do not treat this as a server error.

---

# 30. Error State

If curriculum data cannot load:

* show a safe learner-facing error
* offer Retry when practical
* retain navigation back to other levels/dashboard
* never render fabricated placeholder curriculum

Do not expose:

* SQL errors
* internal UUID relationships
* stack traces
* database connection information

---

# 31. Accessibility

Required:

* dropdown keyboard navigation
* `Escape` closes header dropdown
* visible focus states
* appropriate minimum touch targets
* current level communicated without color alone
* collapsible sections use `aria-expanded`
* view controls have accessible names
* card links have meaningful accessible labels
* list rows remain keyboard-accessible

Example card accessible label:

```text
View gato — cat
```

not:

```text
Card
```

---

# 32. Motion

Keep animation restrained because this is a dense browsing screen.

Appropriate:

* dropdown open/close transition
* subtle hover/tap feedback
* collapse/expand transition
* view-mode layout transition where inexpensive

Do not:

* delay navigation for animation
* animate dozens of cards heavily
* introduce elaborate entrances every time the level changes

Respect:

```text
prefers-reduced-motion
```

---

# 33. Suggested Component Structure

Suggested organization:

```text
app/(app)/levels/[level]/
  page.tsx
  loading.tsx

components/levels/
  level-selector.tsx
  level-page-header.tsx
  level-content-section.tsx
  level-item-grid.tsx
  level-item-card.tsx
  level-item-list.tsx
  level-view-controls.tsx
  level-empty-state.tsx

components/shared/
  levels-dropdown.tsx

domains/curriculum/
  existing database-backed repository/service
```

The exact filenames may change if existing abstractions make another split cleaner.

Do not create a second curriculum domain for this page.

---

# 34. Header Integration

Update:

```text
components/shared/app-header.tsx
```

so the desktop Levels navigation entry renders the dropdown rather than:

```text
<Link href="/levels">
```

The existing navigation order remains otherwise unchanged.

Example:

```text
Levels ▼    Reviews    Decks    Practice    Journey
```

Do not redesign the entire application header as part of this spec.

---

# 35. Implementation Units

Implement incrementally.

## Unit 1 — Level curriculum read model

Build the server-side data shape required by one Level page.

Include:

* selected level
* ordered grammar items
* ordered vocabulary items
* stable item IDs
* display text
* translations/descriptions

Use real PostgreSQL-backed curriculum data.

No major UI yet.

---

## Unit 2 — Header Levels dropdown

Replace the current Levels link.

Implement:

* dropdown trigger
* 10×5 desktop grid
* Levels 1–50
* keyboard/focus behavior
* responsive mobile equivalent
* dynamic level links

Verify the rest of the header still behaves correctly.

---

## Unit 3 — Level selector and routing

Implement:

```text
/levels/[level]
```

plus the dense page-level 1–50 selector.

Verify:

* valid level routing
* invalid level handling
* current-level indication
* 2–3 row desktop target
* small horizontal margins

---

## Unit 4 — Grammar and Vocabulary content

Implement:

* Grammar first
* Vocabulary second
* section headers
* collapsible behavior
* default-open state
* curriculum ordering
* empty states

---

## Unit 5 — Grid cards

Implement the default:

```text
8 per row desktop
```

card layout.

Cards contain:

```text
large item
smaller translation
```

and navigate to the stable item-detail URL.

Verify both vocabulary and grammar.

---

## Unit 6 — Display modes

Implement:

```text
large grid
default grid
compact grid
list
```

including responsive behavior.

Changing modes must not alter the selected level.

---

## Unit 7 — Responsive/accessibility/browser verification

Verify:

* desktop
* tablet
* mobile
* keyboard-only interaction
* reduced motion
* dropdown usability
* collapse controls
* grid density
* list mode
* item navigation
* no horizontal overflow

Update `progress-tracker.md` after completion.

---

# 36. Required Unit Tests

Cover at minimum:

```text
valid level parsing
invalid level parsing
selected level retrieval
language-scoped retrieval
grammar ordering
vocabulary ordering
empty grammar
empty vocabulary
empty entire level
```

If the level read model performs transformation logic, test the transformation independently of React.

---

# 37. Component Tests

Cover:

```text
Levels header control opens dropdown
dropdown renders exactly Levels 1–50
desktop dropdown contains 50 links
Level 1 points to /levels/1
Level 50 points to /levels/50
Escape closes dropdown
current level is indicated
grammar appears before vocabulary
grammar defaults expanded
vocabulary defaults expanded
grammar can collapse
vocabulary can collapse
default view renders cards
large mode changes layout
compact mode changes layout
list mode renders list rows
item card contains item + translation
item card links to stable item route
```

---

# 38. Browser Verification

### Header

Verify:

* Levels no longer navigates immediately
* clicking Levels opens dropdown
* dropdown is 10×5 on desktop
* all 50 numbers are visible
* selecting Level 17 navigates to `/levels/17`
* keyboard interaction works

### Level page

Verify:

* all 50 levels appear at top
* desktop selector fits approximately 2–3 rows
* horizontal margins remain small
* active level is visually clear
* Grammar appears first
* Vocabulary appears second
* both collapse correctly
* default mode shows approximately 8 cards per row
* larger cards show fewer per row
* smaller cards show more per row
* list mode works
* cards navigate correctly

### Responsive

Verify:

* no horizontal page overflow
* level controls remain usable on mobile
* curriculum cards remain readable
* list view fits the viewport
* touch targets remain usable

---

# 39. Out of Scope

Do not implement as part of this spec:

* full Item Detail page
* editing curriculum
* curriculum admin UI
* lesson launching from a card
* direct SRS actions
* manual level unlocking
* review actions
* vocabulary-group filtering
* grammar filtering
* search
* sorting controls
* favorites
* user notes editing
* item progress reset
* progress statistics inside cards

Those belong to later feature specs.

---

# 40. Completion Criteria

Spec 10 is complete when:

1. The header Levels link has been replaced with a dropdown.
2. The desktop dropdown shows Levels 1–50 in a 10×5 grid.
3. Clicking a level navigates directly to `/levels/[level]`.
4. There is no required standalone `/levels` landing page.
5. Every level page displays the full 1–50 selector.
6. The page-level selector uses most available horizontal space and targets 2–3 desktop rows.
7. The selected level is clearly indicated.
8. Grammar appears before Vocabulary.
9. Both sections are independently collapsible.
10. Grammar and Vocabulary are expanded by default.
11. Curriculum uses real database-backed data.
12. The default grid targets 8 cards per desktop row.
13. Cards are slightly taller than wide with modest rounded corners.
14. Each card displays a large learning item and smaller translation/description.
15. Larger-grid mode displays fewer cards per row.
16. Compact-grid mode displays more cards per row.
17. List mode displays the same curriculum as clickable rows.
18. Card links use stable item identity.
19. Browsing Levels never mutates SRS or curriculum progression.
20. Desktop, mobile, keyboard, and reduced-motion behavior are verified.
21. Typecheck, lint, unit tests, integration tests where applicable, and build pass.
22. `progress-tracker.md` is updated after implementation.
