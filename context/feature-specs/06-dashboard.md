# Dashboard

Read `AGENTS.md`, `context/ui-context.md`, `context/project-overview.md`, `context/architecture.md`, and `context/progress-tracker.md` before starting.

Build the main signed-in dashboard.

Route:

`/dashboard`

---

### Layout

Create the authenticated app shell separately from the marketing layout.

Desktop:

* centered content with a max width
* thin outer margins so content fills most of the screen
* responsive card/grid layout
* Level Progress forms the right column beside the main dashboard content

Mobile:

* stack sections vertically
* no horizontal scrolling
* keep primary actions easy to reach

---

### Welcome

Display a free-floating greeting at the top right:

`Welcome back, <Name>.`

Do not place it inside a card or style it as a large hero.

---

### Learning & Review

Display Lessons and Reviews as the primary dashboard actions.

**Lessons**

Green-tinted card containing:

* `Lessons`
* `Learn something new today`
* `Start lessons` button
* `Customize` button beside it

**Reviews**

Display:

* number of reviews currently available
* `Start reviews` action when reviews are available
* next review time when none are available

Do not hardcode counts.

---

### Item Forecast

Card titled `Item Forecast`.

Display a stacked bar chart showing upcoming review items.

* vocabulary and grammar use their existing semantic colors
* x-axis represents time
* y-axis represents item count
* toggle between `24 Hours` and `7 Days`
* animate axis and bar changes when switching ranges
* toggle uses a simple movement animation

Use Spring for graph transition animation.

---

### Review History

Card titled `Review History`.

Display a line graph of completed reviews over time.

Toggle between:

* `24 Hours`
* `7 Days`
* `30 Days`

Use the same animated toggle and graph-transition behavior as Item Forecast.

---

### Level Progress

Long card in the right column spanning from Learning & Review through Review History.

Display:

* current level
* weekly activity streak with one dot per day and a fire indicator for active days
* vocabulary progress for the current level
* grammar progress for the current level
* overall item progress

Use the existing vocabulary, grammar, and proficiency semantic colors.

---

### Practice

Display four practice cards below the dashboard graphs and Level Progress.

Four columns on large screens, responsive below that.

Include:

* Speaking
* Listening
* Reading
* Writing

Each card links to its corresponding practice area.

Do not build the practice experiences in this unit.

---

### States

Every data-driven section must support:

* loading
* populated
* empty

Empty states should direct the user toward the next useful action rather than leaving blank cards.

Cover cases such as:

* new user with no progress
* no reviews available
* no forecasted reviews
* no review history

---

### Components

Reusable dashboard components belong under:

`components/dashboard/`

Keep route files focused on page composition.

Do not duplicate shared components or modify `components/ui/*`.

---

### Rules

* use semantic design tokens only
* no hardcoded colors
* do not hardcode progress, review counts, streaks, or graph data
* structure dashboard data so real database values can replace temporary development data cleanly
* keep cards information-dense rather than oversized
* support light and dark themes
* provide visible keyboard focus states
* graph animation must not interfere with reduced-motion preferences

---

### Scope Limits

Do not build:

* lesson flow
* review session flow
* Journey/history page
* practice experiences
* profile/settings
* level-selection page
* drag-and-drop dashboard customization
* XP, achievements, or additional gamification

This unit establishes the dashboard UI and navigation points only.

---

### Tests

Cover:

* dashboard renders all required sections
* lessons and reviews actions render correctly
* review empty state renders when no reviews are available
* graph range toggles switch between their documented ranges
* progress and graph values come from supplied data rather than hardcoded values
* new-user empty states render correctly
* practice cards link to their expected routes

---

### Check When Done

* `/dashboard` renders inside the authenticated app shell
* Lessons and Reviews are clearly visible primary actions
* Item Forecast supports 24-hour and 7-day views
* Review History supports 24-hour, 7-day, and 30-day views
* Level Progress displays streak, vocabulary, grammar, and overall progress
* four Practice cards render
* loading and empty states work
* responsive on mobile and desktop
* light and dark themes work
* animations respect reduced motion
* `npx tsc --noEmit` passes
* `npm run lint` passes
* `npm run test` passes
* `npm run build` passes
* `context/progress-tracker.md` updated
