# Progress Tracker

Update this file whenever the current phase, active feature, or implementation

## Current Phase

Implementation / feature specs

## Current Goal

Implement feature specs in order from `context/feature-specs/`. Feature-spec 02 (Component Design — base chrome unit: layout tokens, navbar, mobile menu, skip link) and feature-spec 03 (Landing Page — page body: hero, SRS trail, pillars, review preview, practice modes, closing CTA, scroll reveals) are both done; awaiting the next spec (the handwriting "hola" animation is explicitly out of scope for 03 and is the next known unit).

## Completed

- Product overview completed
- Architecture specification completed
- Code standards completed
- UI context completed
- AI workflow rules completed
- Initial progress tracker completed
- Context-file audit (2026-08-20): resolved contradictions across the context files
- Feature-spec 01 — Design System (2026-08-21): shadcn/ui installed and configured (Button, Card, Dialog, Input, Tabs, Textarea, ScrollArea), `lucide-react` installed, `cn()` helper added at `lib/utils.ts`, and the `ui-context.md` theme tokens (light/dark palette, Shantell Sans) wired into `app/globals.css`/`app/layout.tsx`. Verified via `tsc`, `eslint`, `npm run build`, and a browser check of all 7 components in both themes — no console errors. Installed at the repo's actual root-level `components/`/`lib/` (no `src/` dir exists yet — see open item below).
- Feature-spec 02 — Component Design / base chrome (2026-08-25): added the layout/z-index/motion tokens to `app/globals.css`; built the marketing route-group shell (`app/(marketing)/layout.tsx`), the server-component `SiteHeader` with its scroll-driven translucent background (`SiteHeaderScroll`, client) and mobile sheet menu (`SiteNavMobile`, client, via the newly added shadcn `Sheet` primitive), and the `SkipLink`; stood up the project's Vitest/Testing Library infrastructure (previously absent) with `site-header.test.tsx` (4 tests); verified via `tsc`, lint, test, build, and a real-browser check (desktop + mobile) of the scroll transition, mobile menu, and skip link.
- Feature-spec 03 — Landing Page body (2026-08-25): replaced the placeholder `app/page.tsx` with `app/(marketing)/page.tsx` (server component, `metadata` set), composed from six new server components under `components/marketing/` — `hero-section.tsx` (the `<h1>`, with `hola` isolated in its own styled `<span>` so the future handwriting animation only touches that node), `srs-section.tsx` (all 9 SRS stages from `project-overview.md`'s Standard Review Intervals, grouped into the 5 documented `--srs-*` accent colors per `ui-context.md`'s sub-stage grouping rule, plus a level-unlock note sourced from `architecture.md`'s 5/6-ratio rule — see Open Questions/Architecture Decisions below), `pillars-section.tsx` (vocabulary/grammar counts from `project-overview.md`), `review-preview-section.tsx` (static/`readOnly` review mock), `practice-section.tsx` (6 practice-mode cards, keyboard-focusable with a visible focus ring), and `closing-section.tsx`; added `components/shared/reveal.tsx` (client scroll-reveal wrapper, `IntersectionObserver`-driven, with `prefers-reduced-motion` and unsupported-browser fallbacks handled via a lazy `useState` initializer rather than an effect-driven `setState` to satisfy the `react-hooks/set-state-in-effect` lint rule) used throughout the new sections; added one test file per new component (11 tests total including the pre-existing 4). Verified via `tsc`, lint, `npm run test` (11/11), `npm run build`, and a real headless-browser check (Playwright, no project `chromium-cli` skill existed so one was installed ad hoc into the scratch dir, not the project) at desktop/mobile viewports confirming correct heading structure, card counts, the `readOnly` mock input, the reused navbar's scroll behavior, a visible focus ring on practice cards, zero console errors, and — after an actual scroll-through — zero elements left stuck at `opacity-0` by `Reveal`.
- Feature-spec 03 follow-up — visual richness pass (2026-08-25): the user shared an external reference landing page implementation and asked to "match" its polish; after flagging that it used a wholly different token system (`terraza-*`), pulled in out-of-scope content (testimonials, pricing/changelog links, an already-wired handwriting animation), and redirected on `useAuth()` before Clerk exists, the user chose to keep our existing `ui-context.md` palette/scope and only adopt the reference's decorative energy. Added to `hero-section.tsx`: `FloatingGreetings` (decorative multilingual "hello" words behind the hero, `aria-hidden`, hidden below `sm` because it crowded the narrower text column) and `GreetingMarquee` (infinite-scrolling row of the same words, mask-faded edges) — both satisfy `ui-context.md`'s previously-unbuilt "multilingual words around the hero" / "languages saying forms of hello" requirements and are pure CSS (no new client components). Added a numbered `animate-bob` badge to each SRS stage card, `animate-bob` to the practice-mode icons, and a small `SparklesIcon` to the closing CTA. New `app/globals.css` keyframes (`lp-float`, `lp-bob`, `lp-marquee`) are transform-only per the spec's animation rule and are disabled under `prefers-reduced-motion`. Re-verified `tsc`/lint/test/build and a real-browser pass at both viewports (no horizontal overflow from the marquee's doubled track, no console errors).

## In Progress

- None

## Next Up

- The handwriting "hola" stroke animation, explicitly deferred by feature-spec 03 (`hero-section.tsx`'s `hola` word is a static styled `<span>` today, structured so the swap touches only that node).
- The real footer (still a placeholder from feature-spec 02).
- The `/about`, `/demo`, `/sign-up`, and `/sign-in` routes (all currently un-created; linked but 404).

## Open Questions

- How many curriculum levels are free (referenced by the closing CTA copy): `architecture.md` documents "free Levels 1-3 / premium Level 4+" as the access-tier configuration, but feature-spec 03 explicitly instructed not to state a level count in landing-page copy and to record this as unresolved, on the reasoning that this is marketing/product-facing copy rather than the access-tier implementation detail `architecture.md` describes. Revisit if/when the landing page is asked to state a concrete free-tier level count.

## Architecture Decisions

- Client-component boundary for the navbar (2026-08-25): the sticky scroll-driven background/border lives in a dedicated `site-header-scroll.tsx` client component, kept separate from `site-nav-mobile.tsx`'s client boundary, so `site-header.tsx` itself stays a server component per `code-standards.md`'s "keep client components low in the tree" guidance. Precedent for any future component that needs both a server-rendered shell and one isolated piece of scroll/interaction JS.
- SRS accent-color token naming (2026-08-25, feature-spec 03): the spec's literal text asks for `--srs-1` through `--srs-5` tokens on the SRS stage cards, but no such tokens exist — `ui-context.md` and `app/globals.css` define `--srs-beginner`/`--srs-familiar`/`--srs-intermediate`/`--srs-master`/`--srs-fluent` (5 tokens) and explicitly document that all 9 sub-stages are grouped into those 5 by stage name. Treated the spec's "5 tokens, light to dark" as referring to these existing 5 grouped tokens rather than a naming mismatch to ask about, since the mapping is unambiguous once connected to `ui-context.md`'s grouping rule.
- Level-unlock threshold sourcing (2026-08-25, feature-spec 03): the SRS section's bordered unlock-rule note was specced to source its facts only from `project-overview.md`, with an explicit instruction to stop and ask if a value was missing there — `project-overview.md` only has vague language ("configured progression threshold", no ratio or stage name); the concrete rule (5/6 of a level's items must reach at least Familiar 1) lives in `architecture.md`. Asked the user; they chose to use `architecture.md`'s concrete rule over staying strictly within `project-overview.md`'s vaguer language.

## Session Notes

- Vitest was not previously wired into this project; feature-spec 02 was the first unit to require `npm run test`, so the base Vitest/Testing Library setup (config, setup file, script) now exists for all future component tests to reuse.
- `context/feature-specs/02-landing-page.md` was renamed (content-identical) to `02-component-design.md` before feature-spec 03 was authored; `progress-tracker.md` and this file's history now refer to that unit as "feature-spec 02 — Component Design."
- Feature-spec 03 removed the scaffold `app/page.tsx` (the `create-next-app` placeholder) since `app/(marketing)/page.tsx` now owns the `/` route — both can't coexist, as route groups don't add a URL segment.
- No project `chromium-cli`/browser-run skill exists yet for this repo; the real-browser verification for feature-spec 03 installed Playwright ad hoc into the scratch directory (not the project's `package.json`/lockfile) to drive a headless Chromium session. If browser verification becomes routine, consider running `/run-skill-generator` to capture this as a reusable project skill.