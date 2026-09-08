# Onboarding Slideshow

Add a polished five-slide onboarding experience shown after a user completes sign-up.

The onboarding should feel highly animated and professional while remaining fast, accessible, and easy to replace with custom animation assets later.

## Flow

Show onboarding after first successful account creation before entering the normal app.

Slides:

1. **Welcome**
2. **Grammar + SRS**
3. **Speaking & Listening**
4. **Decks**
5. **Get Started**

Persist onboarding completion on the internal user record so it is not shown automatically again after completion.

Completing the final slide redirects the user into the normal authenticated experience.

## Layout

Use a full-screen slideshow.

Each slide should have:

* its own distinct background/theme color
* large heading
* short supporting copy
* animated feature demonstration
* centered progress dots near the bottom
* sticky `Back` button bottom-left
* sticky `Next` button bottom-right

Keep navigation positions consistent between slides.

Hide or disable `Back` on Slide 1.

Progress dots should clearly show:

* completed slides
* current slide
* remaining slides

Do not allow the progress indicator to shift position between screens.

## Slide 1 — Welcome

Headline:

`Welcome to Polyglot`

Introduce the product and establish the visual style.

Use a looping/repeating animation that introduces the language-learning experience without requiring interaction.

Keep this screen simple and visually memorable.

## Slide 2 — Grammar + SRS

Explain that Polyglot builds a grammar foundation and reinforces learned material through spaced repetition.

Animation should visually demonstrate concepts such as:

```text
Learn
→ Practice
→ Review later
→ Strengthen
```

Show grammar as a foundational part of progression rather than presenting SRS as vocabulary-only.

Keep the explanation concise.

## Slide 3 — Speaking & Listening

Showcase speaking and listening practice.

Use looping UI demonstrations such as:

* microphone interaction
* speaking response
* waveform/listening animation
* audio playback
* correct/feedback states

Animations should resemble real Polyglot UI rather than generic illustrations where practical.

## Slide 4 — Decks

Introduce Decks as supplementary practice.

Show:

* a deck selection
* vocabulary/grammar cards
* practice progression
* optional Know / Don't Know interaction

Make clear that decks are additional practice rather than the main curriculum progression system.

## Slide 5 — Get Started

Provide a concise final message encouraging the learner to begin.

The bottom-right button changes from:

`Next`

to:

`Start Now!`

When this button first appears:

1. change to its final accent color
2. quickly inflate/enlarge
3. smoothly shrink back to normal size
4. settle into a subtle idle state

Run this emphasis animation once when Slide 5 becomes active.

Clicking `Start Now!`:

* marks onboarding completed server-side
* redirects into the normal application
* must not create duplicate completion effects if clicked repeatedly

## Slide Transitions

Use smooth animated transitions between slides.

Recommended behavior:

* outgoing content moves/fades away
* incoming content slides/fades into place
* direction should reflect Back vs Next navigation
* background/theme transition should feel coordinated with content

Avoid excessive motion, long transition delays, or animations that block navigation.

Users should be able to move through onboarding quickly even while decorative animations are running.

## Animation Architecture

Keep slideshow navigation separate from slide animation implementations.

Use a structure conceptually similar to:

```text
onboarding/
  onboarding-flow
  onboarding-navigation
  onboarding-progress
  slides/
    welcome-slide
    srs-slide
    practice-slide
    decks-slide
    start-slide
```

Each slide owns its visual demonstration.

The main slideshow only owns:

* current slide
* navigation
* transition direction
* completion
* progress dots

Do not put every animation inside one large component.

## Replaceable Animations

Design slide animations behind simple components so they can later be replaced with:

* custom React animations
* SVG
* Lottie
* video
* image sequences
* other custom assets

Replacing the visual animation for a slide should not require changing:

* navigation
* onboarding state
* progress tracking
* completion logic
* slide transitions

Do not couple business logic to animation timing.

## Performance

Keep onboarding lightweight.

* prefer CSS transforms/opacity for motion
* avoid unnecessary rerenders during loops
* do not continuously update React state for purely visual animation
* lazy-load heavy animation assets when appropriate
* avoid loading future large videos/images before required
* respect existing reduced-motion preferences
* clean up timers/listeners when slides unmount

Animations should remain smooth on mobile and desktop.

## Responsive Design

Support desktop, tablet, and mobile.

Desktop may use larger feature demonstrations.

Mobile should:

* preserve the full-screen experience
* keep navigation reachable
* avoid clipped animation content
* maintain readable headings/copy
* keep progress dots visible

Do not require scrolling to reach `Back`, `Next`, or `Start Now!`.

## Accessibility

Support:

* keyboard navigation
* visible focus states
* semantic buttons
* accessible progress state
* sufficient contrast on every slide color
* reduced-motion mode

When `prefers-reduced-motion` is enabled:

* remove repetitive decorative movement
* simplify slide transitions
* retain all information and controls

Animations must never be required to understand the slide.

## Sandbox Replay

Add onboarding replay controls to the existing Admin/Developer Sandbox.

Provide:

`Replay Onboarding`

This launches the onboarding using sandbox state without modifying the real admin/developer user's onboarding completion status.

The sandbox should allow repeated onboarding playback regardless of whether onboarding was previously completed.

Sandbox replay must:

* use the same production onboarding components
* start at Slide 1
* allow the full Start Now flow to be previewed
* avoid modifying real learner progress
* avoid modifying the real user's onboarding completion state

Do not create a separate fake onboarding implementation for the sandbox.

## State / Backend

Store onboarding completion on the internal Polyglot user.

Use a field such as:

`onboarding_completed_at`

or the equivalent that best fits the existing user schema.

Server-side routing should determine whether onboarding is required.

Do not rely only on:

* localStorage
* browser state
* a client-only redirect

Sandbox replay explicitly bypasses this requirement without changing the stored value.

## Scope Limits

* no onboarding personalization yet
* no branching slides
* no language-specific onboarding variants
* no user-selectable onboarding themes
* no permanent analytics requirement beyond existing safe product analytics
* no custom video assets required in this spec
* no rebuilding existing SRS, Decks, or practice functionality inside onboarding

The animations are visual demonstrations only.

## Check When Done

* New users are routed through onboarding once after sign-up.
* Existing completed users are not automatically shown onboarding again.
* Five slides render in the correct order.
* Every slide has a different visual color/theme.
* Back/Next navigation works correctly.
* Progress dots accurately reflect the current slide.
* Slide transitions animate smoothly in both directions.
* Each feature animation loops independently.
* Slide 5 changes `Next` to `Start Now!`.
* `Start Now!` performs the one-time inflate/shrink/color animation.
* Completion persists server-side and redirects correctly.
* Repeated completion clicks are safe.
* Admin/Developer Sandbox can replay onboarding indefinitely.
* Sandbox replay does not alter real onboarding state.
* Animations can later be replaced without changing slideshow logic.
* Reduced-motion behavior works.
* Mobile and desktop layouts work.
* Tests pass.
* `npm run build` passes.
