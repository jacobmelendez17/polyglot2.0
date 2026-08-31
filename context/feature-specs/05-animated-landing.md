# Hero Handwriting Animation

Read `AGENTS.md`, `context/ui-context.md`, `context/progress-tracker.md`, and the landing-page feature spec before starting.

Replace the static hero accent word with our first hand-drawn animation prototype.

### Hero

Update the headline to:

`Fluency begins ここ`

* `ここ` means "here" in Japanese
* only `ここ` is animated
* keep the rest of the existing hero unchanged
* keep the animation inline with the headline and responsive

### Animation

Use the existing PNG files under `animations-drawn`.

* 31 total frames
* playback order: `31 → 30 → ... → 2 → 1`
* frame `31` is the starting frame
* frame `1` is the completed frame
* use every frame
* play once on page load
* keep frame `1` visible when finished
* do not loop

Playback should feel fast and fluid.

* target roughly `20–30ms` per frame
* approximately `0.6–0.9s` total
* use `requestAnimationFrame` with elapsed-time tracking rather than 31 separate timers

Preload the frames before starting so the animation does not flash or stall.

### Component

Create:

`components/marketing/handwriting-word.tsx`

* client component
* keep `hero-section.tsx` as a server component
* only the animated word should require client-side state
* reserve the image dimensions so changing frames causes no layout shift

### Accessibility

* the headline must still read semantically as `Fluency begins ここ`
* animation images are decorative and `aria-hidden`
* animation is not focusable
* with `prefers-reduced-motion`, skip playback and immediately show frame `1`
* if the PNG sequence fails to load, fall back to static `ここ`

### Rules

* do not modify or rename the source PNG files
* do not install an animation library
* do not convert the frames to GIF, video, SVG, or sprite sheets yet
* do not add language rotation, replay controls, hover animation, or looping
* do not modify unrelated landing-page sections

### Tests

Cover:

* headline contains `Fluency begins ここ`
* animation starts at frame `31`
* frames progress toward `1`
* frame `1` remains after completion
* animation does not loop
* reduced motion skips animation
* failed assets fall back to static `ここ`

### Check When Done

* animation visually runs `31 → 1`
* playback feels fast and smooth
* no flashing between frames
* no layout shift
* responsive on mobile and desktop
* reduced motion works
* `npx tsc --noEmit` passes
* `npm run lint` passes
* `npm run test` passes
* `npm run build` passes
* `context/progress-tracker.md` updated
