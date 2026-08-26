# Progress Tracker

Update this file whenever the current phase, active feature, or implementation

## Current Phase

Implementation / feature specs

## Current Goal

Implement feature specs in order from `context/feature-specs/`. Feature-spec 02 (Landing Page — base chrome unit: layout tokens, navbar, mobile menu, skip link) is done; awaiting the next spec (landing page body).

## Completed

- Product overview completed
- Architecture specification completed
- Code standards completed
- UI context completed
- AI workflow rules completed
- Initial progress tracker completed
- Context-file audit (2026-08-20): resolved contradictions across the context files
- Feature-spec 01 — Design System (2026-08-21): shadcn/ui installed and configured (Button, Card, Dialog, Input, Tabs, Textarea, ScrollArea), `lucide-react` installed, `cn()` helper added at `lib/utils.ts`, and the `ui-context.md` theme tokens (light/dark palette, Shantell Sans) wired into `app/globals.css`/`app/layout.tsx`. Verified via `tsc`, `eslint`, `npm run build`, and a browser check of all 7 components in both themes — no console errors. Installed at the repo's actual root-level `components/`/`lib/` (no `src/` dir exists yet — see open item below).
- Feature-spec 02 — Landing Page base chrome (2026-08-25): marketing route-group layout and navbar.
  - `app/globals.css`: added `--nav-h` (64px, 80px at `md` via a plain media query since Tailwind v4's CSS-first config has no JS-side breakpoint to hook into), `--z-header`/`--z-sheet`/`--z-skip`, `--dur-fast`/`--dur-base`/`--dur-slow`, `--ease-out`/`--ease-soft`, and `--bg-warm-rgb` (light + dark). Added a `.scroll-anchor` utility (`scroll-margin-top: var(--nav-h)`) for future in-page anchors, and `.site-header[data-scrolled="true"]` rules (solid `--bg-warm` fallback, `@supports (backdrop-filter)` override to translucent + blur).
  - `app/(marketing)/layout.tsx`: server component rendering `<SiteHeader />`, `<main id="main">`, and a bordered footer placeholder (wordmark + copyright). No page exists in the group yet (out of scope per spec), so it isn't wired to a route until the landing-page-body unit.
  - `components/shared/site-header.tsx`: server component. Renders the skip link first (so it's the first focusable element once composed into the layout), wordmark, desktop nav (About, Demo, Log in — hidden below `md`), the always-visible green pill Sign-up button (`Button` + `rounded-full`, no `components/ui` edits), and `<SiteNavMobile />`.
  - `components/shared/site-header-scroll.tsx` (client): the *only* piece that needs scroll-position JS — wraps the actual sticky `<header>`, tracks `window.scrollY > 24` via a rAF-throttled listener, and toggles `data-scrolled`.
  - `components/shared/site-nav-mobile.tsx` (client): hamburger trigger + shadcn `Sheet` (`side="top"`, repositioned to `top: var(--nav-h)`) containing About/Demo/Log in. Escape-close, focus trap, and `aria-expanded`/`aria-controls` come from Radix for free; reduced-motion handled via a scoped `.mobile-nav-sheet` CSS override in `globals.css` rather than fighting Tailwind's generated class specificity.
  - `components/shared/skip-link.tsx`: plain `<a href="#main">`, visually hidden until `focus-visible`.
  - Added the shadcn `Sheet` primitive to `components/ui/sheet.tsx` via `npx shadcn add sheet` (same convention as spec 01's installs; not a modification of an existing primitive).
  - Testing infrastructure added (didn't exist before this unit): `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`, `vite-tsconfig-paths` as devDependencies (installed with `--legacy-peer-deps` — this environment's `shadcn`/babel dependency tree conflicts with `@vitejs/plugin-react`'s optional peer on a Babel 8 prerelease; the installed versions themselves are the intended ones, only npm's peer resolution needed the override). Added `vitest.config.mts`, `vitest.setup.ts` (imports `@testing-library/jest-dom/vitest`, registers `afterEach(cleanup)`), and a `"test": "vitest run"` script in `package.json`.
  - `components/shared/site-header.test.tsx`: covers wordmark + all four link hrefs, `aria-expanded` toggling on the mobile trigger, Escape closing the menu and returning focus to the trigger, and the skip link being the first focusable element.
  - Verified with `npx tsc --noEmit`, `npm run lint`, `npm run test` (4/4 passing), and `npm run build` — all green. Also visually verified in a real browser (desktop + mobile viewports) via a temporary throwaway route (`app/(marketing)/verify-temp/`, deleted after verification): confirmed the transparent→translucent-blur scroll transition with the solid-fallback path, the mobile sheet open/close/Escape/focus-return behavior, and the skip link's focus-visible appearance. No console errors in either viewport.

## In Progress

- None

## Next Up

- Feature-spec 03 (TBD) — expected to be the landing page body (hero, multilingual "hello" animation, etc.) that fills in `app/(marketing)/page.tsx`, per `project-overview.md`'s Core User Flow and `ui-context.md`'s Landing Page section.

## Open Questions

- None currently blocking. (Resolved during feature-spec 02: the spec's literal text had `site-header.tsx` as a server component doing rAF-throttled scroll listening, while also calling `site-nav-mobile.tsx` "the only client component in the unit" — asked the user, who chose splitting the scroll listener into its own minimal client component (`site-header-scroll.tsx`) rather than making the header itself client-side or dropping the rAF listener for a CSS-only approach.)

## Architecture Decisions

- Client-component boundary for the navbar (2026-08-25): the sticky scroll-driven background/border lives in a dedicated `site-header-scroll.tsx` client component, kept separate from `site-nav-mobile.tsx`'s client boundary, so `site-header.tsx` itself stays a server component per `code-standards.md`'s "keep client components low in the tree" guidance. Precedent for any future component that needs both a server-rendered shell and one isolated piece of scroll/interaction JS.

## Session Notes

- Vitest was not previously wired into this project; feature-spec 02 was the first unit to require `npm run test`, so the base Vitest/Testing Library setup (config, setup file, script) now exists for all future component tests to reuse.