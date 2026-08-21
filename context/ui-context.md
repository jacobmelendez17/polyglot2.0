# UI Context

## Theme

Polyglot uses a **cozy, playful learning-tool aesthetic** with the structure and clarity of a modern SaaS application.

The visual direction is a hybrid:

- Clean, organized application layouts
- Warm notebook/paper-inspired backgrounds
- Handwritten-feeling typography
- Soft cream, peach, and muted green surfaces
- Stronger color only where it communicates learning state or interaction
- Polished motion and playful details without making the application feel childish
- Approximately **6-7 / 10 on the professional-to-playful scale**

The current Polyglot screenshots are the primary visual reference. New UI should feel like an extension of that design rather than a redesign into a generic SaaS dashboard.

### Theme Modes

Polyglot supports:

- Light mode
- Dark mode
- System preference

Light mode is the primary visual reference.

Dark mode must preserve the same warm/cozy visual language. Do not turn dark mode into a high-contrast neon, cyberpunk, or technical-dashboard aesthetic.

### Product vs Landing Page

The public landing page may be more expressive and animated than the authenticated application.

**Landing page**
- Large typography
- Animated multilingual details
- Handwritten/writing effects
- Larger decorative compositions
- Product previews
- Stronger storytelling

**Application**
- Cleaner and more task-focused
- Still warm, handwritten, and animated
- Prioritize learning clarity and speed over decoration

---

## Colors

All application colors must use semantic CSS custom properties.

Do not hardcode hex values inside components.

The light palette is based on the existing Polyglot design shown in the reference screenshots.

### Light Theme

| Role | CSS Variable | Value |
| --- | --- | --- |
| Page background | `--bg-base` | `#F8EFE7` |
| Primary surface | `--bg-surface` | `#FFFFFF` |
| Warm surface | `--bg-warm` | `#F3DDD3` |
| Soft neutral surface | `--bg-soft` | `#F1E7D9` |
| Primary text | `--text-primary` | `#3E4440` |
| Muted text | `--text-muted` | `#97938A` |
| Primary accent | `--accent-primary` | `#7FA69C` |
| Primary accent hover | `--accent-primary-hover` | `#6E978C` |
| Accent foreground | `--accent-foreground` | `#27322E` |
| Border | `--border-default` | `#E1D4C2` |
| Grid line | `--grid-line` | `#EFE3D4` |
| Peach accent | `--accent-peach` | `#EBC4B4` |
| Error | `--state-error` | `#BE7068` |
| Success | `--state-success` | `#6F9B7F` |
| Warning | `--state-warning` | `#D4A85F` |

### Dark Theme

Dark mode should use warm charcoal and muted botanical tones.

| Role | CSS Variable | Value |
| --- | --- | --- |
| Page background | `--bg-base` | `#202521` |
| Primary surface | `--bg-surface` | `#292F2B` |
| Warm surface | `--bg-warm` | `#3B302C` |
| Soft neutral surface | `--bg-soft` | `#32352F` |
| Primary text | `--text-primary` | `#F3ECE4` |
| Muted text | `--text-muted` | `#B8B0A6` |
| Primary accent | `--accent-primary` | `#8DB5AA` |
| Primary accent hover | `--accent-primary-hover` | `#9BC3B8` |
| Accent foreground | `--accent-foreground` | `#1F2925` |
| Border | `--border-default` | `#444B45` |
| Grid line | `--grid-line` | `#343A35` |
| Peach accent | `--accent-peach` | `#9B7061` |
| Error | `--state-error` | `#D3877F` |
| Success | `--state-success` | `#87B395` |
| Warning | `--state-warning` | `#D8B371` |

### Learning-Type Colors

Only learning categories that currently require a strong visual identity receive dedicated colors.

| Learning Type | CSS Variable | Light | Dark |
| --- | --- | --- | --- |
| Vocabulary | `--learning-vocabulary` | `#7FA8C2` | `#8DB5CE` |
| Grammar | `--learning-grammar` | `#C98279` | `#D79289` |

Do not invent unique colors for speaking, listening, reading, writing, tests, or other practice types unless the design is explicitly expanded later.

### SRS Stage Colors

SRS progression uses a light-to-dark green progression.

| Stage | CSS Variable | Light |
| --- | --- | --- |
| Beginner | `--srs-beginner` | `#CFE1D8` |
| Familiar | `--srs-familiar` | `#ADCCBE` |
| Intermediate | `--srs-intermediate` | `#8CB5A4` |
| Master | `--srs-master` | `#69947F` |
| Fluent | `--srs-fluent` | `#405F50` |

Dark mode may adjust these values for contrast while preserving the same ordering from light green to deep green.

SRS color is supporting information. Text labels must remain present; color alone must never communicate stage.

---

## Background Pattern

The notebook/grid-paper background is part of Polyglot's visual identity.

Use a subtle square grid over `--bg-base`.

- Grid lines use `--grid-line`.
- Grid contrast must remain low.
- The grid should support the page rather than compete with content.
- Cards and primary content surfaces may obscure the grid with solid surfaces.
- Dark mode should retain a subtle grid using the dark `--grid-line` token.
- Do not introduce unrelated dotted, technical blueprint, or high-contrast graph patterns.

---

## Typography

### Primary UI Font

Use the **existing handwritten Polyglot font currently used in the reference design** as the primary application font.

The implementation agent should preserve the font family already configured in the existing project rather than replacing it with a generic SaaS font.

Map it to:

```css
--font-sans
```

The handwritten typeface is intentional and should be used for:

- Navigation
- Buttons
- Dashboard cards
- Headings
- Body copy
- Learning interfaces
- Statistics
- Landing-page copy

Do not replace it with Geist, Inter, Arial, or another generic UI typeface unless explicitly instructed.

### Mono Font

Use a clean monospace font only for technical/admin/debug contexts where monospace is genuinely useful.

```css
--font-mono
```

The normal learner-facing UI should not look like a code editor.

### Language-Specific Typography

Language content must allow script-specific fallback fonts where necessary.

The primary UI font should not prevent proper display of:

- Spanish diacritics
- Japanese
- Korean
- Chinese
- Devanagari
- Other future scripts

Language-specific font handling should be configurable rather than hardcoded throughout components.

### Typography Character

Typography should feel:

- Human
- Warm
- Relaxed
- Handwritten
- Clear enough for repeated study sessions

Avoid overly polished corporate typography or aggressive gamified display fonts.

---

## Border Radius

Use moderate rounding.

| Context | Class |
| --- | --- |
| Small badges / compact controls | `rounded-md` |
| Buttons / inputs | `rounded-lg` |
| Cards / dashboard widgets | `rounded-xl` |
| Large panels / modals / celebrations | `rounded-2xl` |

Pill shapes are appropriate for:

- Primary action buttons
- Compact filters
- Language selectors
- Small segmented controls
- Tags

Do not make every component a pill.

---

## Borders and Shadows

The current design relies more on soft borders and layered surfaces than heavy shadows.

### Default Cards

Use:

- `--bg-surface`
- subtle `--border-default`
- minimal soft shadow only where depth is useful

### Important Learning Cards

Lessons, reviews, and other important learning actions may use:

- `--bg-warm`
- stronger accent treatment
- subtle tinted background
- larger visual hierarchy

Avoid:

- Heavy black drop shadows
- Glassmorphism as the default visual language
- Bright neon outlines
- excessive gradients
- strong 3D skeuomorphism

---

## Component Library

Use **shadcn/ui on top of Tailwind CSS**.

Base components live in:

```text
components/ui/
```

Reusable Polyglot application components live in:

```text
components/shared/
```

Prefer composing or wrapping shadcn components instead of recreating accessible primitives from scratch.

Do not alter shadcn base components merely to make one page look different when a wrapper or variant is more appropriate.

Use CVA for reusable visual variants where appropriate.

---

## Navigation

### Desktop Signed-In Navigation

Use a **top navigation bar only**.

Layout:

```text
[ polyglot logo ]                     [ levels ] [ decks ] [ practice ] [ journey ] [ profile ]
```

- Logo remains on the left.
- Primary navigation remains on the right.
- Profile may include avatar and active-language controls.
- Keep navigation visually light and integrated with the notebook background.
- Use a subtle bottom border/separator.
- Do not introduce a permanent desktop sidebar unless the product direction explicitly changes.

### Mobile Navigation

Use bottom navigation for the most important learner destinations:

```text
Home | Learn | Reviews | Practice | More
```

Less-used navigation belongs under **More**.

The exact navigation labels may map to product terminology, but the mobile hierarchy should prioritize frequent learning actions.

---

## Dashboard

The dashboard uses a responsive widget grid.

### General Structure

Recommended visual hierarchy:

1. Greeting / welcome card
2. Lessons and Reviews
3. Progress
4. Review activity / forecast
5. XP / Fluent / tricky-item summaries
6. Practice links
7. Additional widgets
8. Dashboard customization control

### Widget Sizing

Dashboard cards **must not all be forced to the same width or height**.

Widget size should reflect its content.

Examples:

- Lessons: large
- Reviews: large
- Progress: wide
- XP: narrow
- Forecast: medium/wide
- Small statistics: compact
- Charts: wider than simple numeric widgets

The resulting grid should feel composed rather than mechanically uniform.

### Dashboard Customization

Users may:

- Reorder widgets

Users do not currently resize widgets or independently show/hide arbitrary widgets unless that requirement is added later.

Reordering should preserve responsive layout constraints.

### Lessons and Reviews

Lessons and Reviews are the strongest action cards.

They should clearly display:

- Available count
- Short explanatory copy
- Primary action
- Relevant secondary action when applicable

These cards may use stronger warm/accent surfaces than ordinary statistic cards.

### Charts

Charts should match the soft visual language.

- Avoid dense axes and heavy chart chrome.
- Prefer muted grid/label treatment.
- Use semantic tokens.
- SRS charts may use SRS stage colors.
- Forecast charts should remain readable without becoming visually dominant.

---

## Landing Page

The landing page should be more expressive than the authenticated application.

Preserve the current visual concept:

- Warm graph-paper background
- Centered slogan/hero message
- Multilingual words around the hero
- Languages saying forms of “hello”
- Handwriting/writing-on animation
- Soft muted palette
- Primary green CTA
- Large handwritten typography

The multilingual “hello” writing animation is part of the desired identity and should remain.

Landing-page animation may be richer than normal dashboard animation, but it must remain performant and respect reduced-motion preferences.

---

## Demo Mode

Demo mode should have a persistent but unobtrusive notice.

Example concept:

> **Demo Mode** — Explore Level 1. Create an account to save your progress.

The banner should:

- Match the cozy palette
- Remain visible enough to prevent confusion
- Avoid looking like an error/warning
- Provide a clear account/signup action where appropriate

---

## Learning Item Page

Learning-item pages should feel detailed without becoming visually dense.

### Header

The top center contains:

- Item name
- Primary translation

Below it is a compact anchor-navigation row:

```text
Meaning | Examples | Resources
```

These links scroll to the corresponding page section rather than changing routes.

### Main Desktop Layout

Below the header:

```text
Main learning content            Progress sidebar
```

On mobile, the progress sidebar stacks below the main content.

### Content Order

The main content should generally follow:

1. Meaning / definition
2. Article / part of speech / item metadata
3. Pronunciation and IPA displayed together
4. Context card
5. Examples
6. Creator Notes
7. Your Notes
8. Resources

### Pronunciation

Audio pronunciation controls should sit visually near the IPA/pronunciation information rather than being separated into a distant section.

### Context Card

Context receives its own clear card before examples.

It should explain how the item is actually used rather than merely repeating its dictionary meaning.

### Notes

**Creator Notes** appear before **Your Notes**.

Creator Notes are official learning content.

Your Notes are personal user content and should be visually distinguishable without looking secondary or hidden.

### Resources

Resources appear below Your Notes and may contain approved supporting references or links.

### Progress Sidebar

The progress area may display:

- Core SRS stage
- Speaking stage
- Listening stage
- Other skill progress when available
- Unlock date
- Next review
- Fluent/completion date
- Statistics
- Reset-item action where allowed

Progress information should be scannable and should not overpower the educational content.

---

## Lesson Interface

Lessons use a **full-focus layout**.

Normal application navigation is hidden or minimized while a lesson is active.

### Lesson Header

The current learning item is displayed at the top center.

Provide an explicit exit control.

### Item Content

The current item displays the same major educational information used on its normal item page.

The content area may scroll vertically.

### Item Selector

Available lesson items appear along the bottom so the learner can switch among them.

The current item must be visually distinct.

Track whether each item has been opened during the current ephemeral lesson session.

### Quiz Availability

The lesson quiz action appears only after every lesson item has been opened at least once.

The UI may visually communicate which items have and have not yet been viewed.

### Lesson Exit

Because unfinished lessons are intentionally ephemeral:

- Exiting does not imply saved lesson progress.
- Refreshing does not imply saved lesson progress.
- The interface should make destructive exit behavior understandable where necessary.

---

## Review Interface

Reviews use a distraction-free, Bunpro-inspired layout.

There is **no large card around the central review word**.

### Desktop Structure

```text
Exit                [ progress bar ]                Session stats

                         gato

                    [ answer input ]

               [ á ] [ é ] [ í ] [ ó ] [ ú ] [ ü ] [ ñ ]

                       Submit
```

### Top Bar

**Top left**
- Exit

**Top center**
- Review progress bar

**Top right**
- Remaining items
- Accuracy percentage
- Other compact session statistics when useful

### Input

- The answer field sits directly below the prompt.
- Provide clickable Spanish accented-character helpers:
  - á
  - é
  - í
  - ó
  - ú
  - ü
  - ñ
- These helpers insert the character into the active answer input.

### Keyboard Behavior

`Enter` is the primary review hotkey.

Expected behavior:

1. Enter submits the current answer.
2. After feedback is displayed, Enter advances to the next question.

Do not require mouse interaction for normal review flow.

### Correct Feedback

Correct responses may use:

- Green feedback
- Check animation
- Brief positive transition

Feedback should be clear and fast.

### Incorrect Feedback

Incorrect responses should:

- Use error styling
- Clearly show that the answer was incorrect
- Reveal supporting item information below the input
- Show what the learner entered
- Show the expected/correct answer
- Explain what was wrong where that information is available

The feedback area should expand below the central review interaction rather than navigating away.

Incorrect feedback should educate, not merely flash red.

---

## Accent Input Controls

Reusable text-input components used for Spanish answers should support optional accent helpers.

Accent helpers must:

- Be keyboard accessible
- Insert at the current caret position where practical
- Not erase existing input
- Work on touch devices
- Remain visually secondary to the main answer field

Future languages may provide their own configured character helpers rather than hardcoding Spanish accents into every input component.

---

## Celebrations

Important milestones may use larger celebratory presentation.

Examples:

- Level unlock
- Fluent milestone
- Achievement earned
- Important test completion

### Level-Up Modal

When a learner returns to the dashboard after earning a new level, show a larger animated modal.

The modal should communicate:

- Newly unlocked level
- Milestone/celebration message
- Everything newly unlocked with that level

This may include:

- Lessons
- Practices
- Tests
- Other features/content

Celebration should feel rewarding without blocking normal use for an excessive amount of time.

---

## Animation

Polyglot should feel **polished and highly animated**, but complex illustration/graphic-heavy animation should be added deliberately later rather than improvised during ordinary feature implementation.

Use:

- CSS/Tailwind for simple transitions
- Motion for richer UI animation

Appropriate animation includes:

- Card entrances
- Hover/tap states
- Progress changes
- Number/count transitions
- Page/section entrances
- Correct/incorrect feedback
- Modal transitions
- Level-up celebrations
- Landing-page writing effects
- Dashboard widget reordering

Do not invent elaborate mascots, illustrations, particle systems, or major graphic sequences without an explicit design step.

### Motion Rules

- Animations must never control authoritative business logic.
- Learning progress should save independently of animation completion.
- Keep frequent review interactions fast.
- Respect `prefers-reduced-motion`.
- Reduced-motion mode must preserve all functionality and information.

---

## Responsive Layout

Use a mobile-first responsive system.

### Desktop

- Top navigation
- Multi-column dashboard grid
- Main-content + progress-sidebar item pages

### Tablet

- Preserve generous spacing
- Use large tap targets
- Support landscape layouts well
- Leave sufficient room for future handwriting/writing interfaces
- Prepare layouts for future Apple Pencil features without implementing Pencil-only functionality yet

### Mobile

- Bottom primary navigation
- Dashboard widgets stack/reflow naturally
- Item progress sidebar stacks below content
- Review input and accent controls remain comfortably tappable
- Full-focus lessons/reviews use nearly the full viewport

Avoid shrinking desktop layouts until they become cramped.

Recompose them for smaller screens.

---

## Icons

Use **Lucide React** for normal interface icons.

Guidelines:

| Context | Size |
| --- | --- |
| Inline | `h-4 w-4` |
| Buttons / navigation | `h-5 w-5` |
| Major card icon | `h-6 w-6` |

Use stroke-based icons consistently.

Custom illustrations and graphics are allowed for:

- Landing-page artwork
- Achievements
- Milestones
- Celebrations
- Future branded learning graphics

Do not mix multiple general-purpose icon libraries.

---

## Accessibility

The cozy visual style must not reduce usability.

- Maintain sufficient text/background contrast.
- Do not communicate SRS stage, correctness, or learning type through color alone.
- Preserve visible keyboard focus.
- Review flow must be fully keyboard operable.
- Touch targets must be appropriately sized.
- Respect reduced-motion preferences.
- Use semantic HTML and accessible shadcn/Radix primitives.
- Decorative handwritten background text must not interfere with screen-reader navigation.
- Decorative language text should be hidden from assistive technology when it does not add content.

---

## Visual Invariants

New UI must follow these rules:

1. Preserve the warm, notebook-like Polyglot identity.
2. Do not replace the palette with generic blue/purple SaaS colors.
3. Green remains the primary brand/action color.
4. Vocabulary uses blue and grammar uses red when category color is needed.
5. SRS progression moves from lighter green to darker green.
6. The graph-paper background remains a recurring brand motif.
7. Dashboard widgets may have different sizes based on content.
8. Do not force every dashboard card into an identical grid cell size.
9. Desktop application navigation remains top-based rather than sidebar-based.
10. Lessons and reviews use focused learning layouts rather than ordinary dashboard shells.
11. The existing handwritten font remains the primary visual voice.
12. Use semantic color tokens rather than component-level hardcoded colors.
13. Dark mode remains warm and cozy.
14. Animations enhance the experience but never determine learning state.
15. Highly elaborate graphics/animations require an explicit design decision rather than being improvised by the implementation agent.
16. Responsive layouts recompose content rather than merely shrinking desktop UI.
17. New components should look like they belong beside the existing dashboard and landing-page screenshots.

---

## Reference Direction

When there is uncertainty about visual styling, prefer the existing Polyglot screenshots/current implementation over generic shadcn defaults.

The goal is not to make Polyglot look like a standard shadcn application.

shadcn supplies accessible component behavior; **Polyglot's palette, typography, spacing, surfaces, background pattern, animation, and learning-state presentation define the product's identity**.
