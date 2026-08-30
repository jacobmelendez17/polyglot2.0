# Progress Tracker

Update after every meaningful implementation change. Record milestones and durable facts only — Git history holds the implementation detail.

## Current Phase

Implementation / feature specs

## Current Goal

Work through `context/feature-specs/` in order. Specs 01–03 are complete. Next unit is the handwriting "hola" stroke animation deferred by spec 03.

## Completed

Every unit below passed `tsc`, lint, `npm run test`, `npm run build`, and a real-browser check at desktop and mobile viewports unless noted.

- **Context files** (2026-08-20) — six source-of-truth documents written; cross-file contradictions resolved in an audit.
- **Spec 01 — Design System** (2026-08-21) — shadcn/ui configured with Button, Card, Dialog, Input, Tabs, Textarea, ScrollArea; `lucide-react`; `cn()` at `lib/utils.ts`; `ui-context.md` theme tokens and Shantell Sans wired into `globals.css` and `app/layout.tsx`.
- **Spec 02 — Component Design / base chrome** (2026-08-25) — layout, z-index, and motion tokens added to `globals.css`; `(marketing)` route-group layout; `SiteHeader` (server) with `SiteHeaderScroll` and `SiteNavMobile` client boundaries; `SkipLink`; shadcn `Sheet` added. Vitest and Testing Library were stood up in this unit — 4 tests.
- **Spec 03 — Landing Page body** (2026-08-25) — `app/(marketing)/page.tsx` composed from six server sections in `components/marketing/` (hero, SRS trail, pillars, review preview, practice modes, closing CTA) plus `components/shared/reveal.tsx`. 11 tests total.
- **Spec 03 follow-up — visual pass** (2026-08-25) — decorative hero greetings, greeting marquee, and bob animations added; transform-only and disabled under reduced motion.

## In Progress

None.

## Next Up

1. Handwriting "hola" stroke animation — `hero-section.tsx` isolates the word in its own `<span>` so the swap touches only that node.
2. Real footer — still the spec 02 placeholder.
3. `/about`, `/demo`, `/sign-up`, `/sign-in` — linked from the navbar, currently 404.

## Open Questions

- **Free-tier level count in marketing copy.** `architecture.md` configures free Levels 1–3, premium Level 4+. Spec 03 instructed that no level count appear in landing copy pending confirmation that the access-tier config is also the public promise. Resolve before the pricing or about pages are written.

## Architecture Decisions

- **Client-component boundaries** (2026-08-25) — scroll-driven behavior lives in its own minimal client component (`site-header-scroll.tsx`) so the parent stays a server component. Precedent for any server shell needing one isolated piece of interaction JS.
- **SRS color tokens** (2026-08-25) — `ui-context.md` defines five tokens named by stage (`--srs-beginner` … `--srs-fluent`), not nine. All nine sub-stages group into those five by name. Specs referring to "`--srs-1` through `--srs-5`" mean these.
- **Level-unlock rule sourcing** (2026-08-25) — `project-overview.md` describes the threshold only vaguely; the concrete rule (5/6 of a level's items at Familiar 1 or above) lives in `architecture.md`. `architecture.md` is authoritative for this value.
- **External references do not override the token system** (2026-08-25) — a shared reference implementation used a different palette (`terraza-*`), out-of-scope sections, and pre-Clerk auth calls. Only its decorative approach was adopted; `ui-context.md` remains authoritative for color, scope, and structure.

## Environment Notes

- No `src/` directory. Code lives at root-level `components/`, `lib/`, `app/`.
- npm installs require `--legacy-peer-deps` — the shadcn/babel tree conflicts with `@vitejs/plugin-react`'s optional peer on a Babel 8 prerelease. Installed versions are correct; only peer resolution needs the flag.
- `app/page.tsx` was removed. `app/(marketing)/page.tsx` owns `/`. Do not recreate the former — route groups add no URL segment and the two collide.
- Components reading a media query must set initial state with a lazy `useState` initializer. The effect-driven pattern fails the `react-hooks/set-state-in-effect` lint rule. See `components/shared/reveal.tsx`.
- Decorative keyframes `lp-float`, `lp-bob`, and `lp-marquee` exist in `globals.css`. Reuse them; they are transform-only and already gated behind `prefers-reduced-motion`.
- No browser-verification skill exists for this repo. Spec 03 installed Playwright ad hoc into a scratch directory, not the project lockfile. Consider capturing this as a project skill if browser checks become routine.
