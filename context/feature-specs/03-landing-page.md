Read `AGENTS.md`, `context/ui-context.md`, `context/project-overview.md`, and `context/progress-tracker.md` before starting.

Feature-spec 02 built the marketing chrome. The `(marketing)` route group has a layout, a navbar, and a footer placeholder, but no page. This unit builds the landing page body that fills it.

---

### Page

Create `app/(marketing)/page.tsx`.

Requirements:

- server component
- exports `metadata` with a title and description
- renders the section components below, in order
- no client-side data fetching, no auth reads

Each section is its own component under `components/marketing/`. Keep the page file a composition of sections, not a wall of markup.

---

### Section: Hero

Create `components/marketing/hero-section.tsx`.

Requirements:

- headline reading `say hola to fluency`, where `hola` is visually distinguished from the surrounding words using `--accent-primary-hover`
- headline scales fluidly from mobile to desktop and wraps without breaking the accent word onto its own orphan line
- supporting paragraph describing the product in plain language: structured Spanish, vocabulary and grammar treated as equals, reviews scheduled by a spaced-repetition system
- primary call to action → `/sign-up`, quiet secondary call to action → `/demo`
- a short line beneath the buttons naming the dialect: Latin American Spanish, Mexican usage

The `hola` word is a static styled `<span>` in this unit. The handwriting animation replaces it in the next unit — structure the markup so that swap touches only this span.

---

### Section: SRS Trail

Create `components/marketing/srs-section.tsx`.

Requirements:

- explains that every vocabulary word and grammar point moves along one shared schedule
- renders all nine SRS stages as cards in a responsive grid: one column on mobile, three at `md`, five at `lg`
- each card shows the stage name, its position in the sequence, and the wait before the next review
- stage cards use the `--srs-1` through `--srs-5` tokens as a left accent bar, progressing from light to dark
- the final stage shows that no further reviews are scheduled rather than an interval
- below the grid, a bordered note explaining the level-unlock rule

**Stage names, intervals, and the unlock threshold must be read from `project-overview.md`.** Do not invent, round, or reorder them. If a value is missing there, stop and ask.

---

### Section: What You Study

Create `components/marketing/pillars-section.tsx`.

Requirements:

- two equal cards side by side at `md` and above, stacked on mobile
- vocabulary card uses `--learning-vocabulary` for its label; grammar card uses `--learning-grammar`
- each card carries a short paragraph and a list of what the item pages contain
- the section's argument is that grammar is a first-class study item with its own review schedule, not supplementary reading

Item counts per level come from `project-overview.md`. Do not state counts that aren't documented there.

---

### Section: Review Preview

Create `components/marketing/review-preview-section.tsx`.

Requirements:

- a static, non-interactive mock of the review screen
- shows the session bar: exit control, progress bar, remaining count, accuracy
- shows a vocabulary prompt with its article rendered as a smaller muted prefix, per the noun-article rule in `project-overview.md`
- shows the answer input, the accented-character key row, and the submit button in their resting state
- a caption beneath the mock explaining that accents insert at the cursor and Enter submits

**This mock is presentation only.** No input handling, no answer checking, no state. Answer normalization and grading are domain logic and are built in their own unit against tests — implementing a second copy here would create a divergent implementation to unpick later. Render the input as `readOnly` with a resting value.

---

### Section: Practice Modes

Create `components/marketing/practice-section.tsx`.

Requirements:

- responsive card grid: one column mobile, two at `sm`, three at `lg`
- one card per practice mode: speaking, listening, reading, writing and journal, sentences and conjugation, tests
- each card has a `lucide-react` icon, a title, and two or three sentences
- speaking copy must state that recordings are checked and discarded, never stored
- cards lift subtly on hover and show a visible focus ring on keyboard focus

**Do not state which level unlocks which mode.** Those thresholds come from the curriculum CSV and are not yet decided. Write copy that describes each mode without asserting an unlock level.

---

### Section: Closing CTA

Create `components/marketing/closing-section.tsx`.

Requirements:

- warm surface panel using `--bg-warm`, centered
- heading, one supporting paragraph, and the same two calls to action as the hero

**Do not state how many levels are free.** That value is unresolved between the context files. Write copy that invites signup without naming a number, and record the open question in `progress-tracker.md`.

---

### Scroll Reveals

Create `components/shared/reveal.tsx`.

Requirements:

- client component wrapping arbitrary children
- children start at `opacity: 0` and offset slightly on the Y axis
- an `IntersectionObserver` adds the visible state once the element enters the viewport, then unobserves it
- transitions use `--dur-slow` and `--ease-out`
- accepts an optional stagger delay so grid children can cascade
- under `prefers-reduced-motion`, children render visible immediately and no observer is created
- if `IntersectionObserver` is unavailable, children render visible

Reveals must never leave content permanently hidden. Anything wrapped in `Reveal` must be present in the server-rendered HTML.

---

### Rules

Use semantic color tokens only. No hex values and no arbitrary Tailwind color values.

Animate only `transform` and `opacity`.

Every section is a server component except `Reveal` itself.

One `<h1>` on the page, in the hero. Sections use `<h2>`. Do not skip heading levels.

All product claims in copy must trace to `project-overview.md`. Marketing copy is still product specification — a number invented here will be quoted back at you later.

---

### Scope Limits

- don't build the handwriting stroke animation; that is the next unit
- don't build the real footer; the placeholder stays
- don't make the review mock interactive
- don't create `/about`, `/demo`, `/sign-up`, or `/sign-in` routes
- don't add auth, Clerk imports, or session reads
- don't add analytics or tracking
- don't modify `components/ui/*` or the navbar from feature-spec 02

---

### Tests

Add tests under `components/marketing/`.

Cover:

- the page renders exactly one `<h1>` and every section heading is an `<h2>`
- both hero calls to action link to `/sign-up` and `/demo`
- the SRS grid renders nine stage cards in documented order
- the practice grid renders six cards
- the review mock input is `readOnly`
- `Reveal` renders its children into the DOM when `IntersectionObserver` is undefined
- `Reveal` renders children visible when `prefers-reduced-motion` matches

---

### Check when done

- `/` renders the full landing page inside the feature-spec 02 layout
- navbar scroll state visibly engages when scrolling the real page
- all six sections render correctly at mobile, `md`, and `lg` widths
- no content is trapped invisible by a reveal at any viewport
- no hardcoded colors and no arbitrary Tailwind color values
- no product numbers appear in copy that aren't documented in `project-overview.md`
- unresolved copy questions recorded in `progress-tracker.md`
- `npx tsc --noEmit` passes
- `npm run lint` passes
- `npm run test` passes
- `npm run build` passes
- `context/progress-tracker.md` updated with what was completed and what is next
