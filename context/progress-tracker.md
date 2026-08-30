# Progress Tracker

Update after every meaningful implementation change. Record milestones and durable facts only — Git history holds the implementation detail.

## Current Phase

Implementation / feature specs

## Current Goal

Work through `context/feature-specs/` in order. Specs 01–03 are complete. Spec 04 (Clerk auth) is next but implementation is paused pending user decisions — see Open Questions. The handwriting "hola" stroke animation deferred by spec 03 follows after that.

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

1. Spec 04 — Auth (Clerk) — blocked pending answers to the auth open questions below.
2. Handwriting "hola" stroke animation — `hero-section.tsx` isolates the word in its own `<span>` so the swap touches only that node.
3. Real footer — still the spec 02 placeholder.
4. `/about`, `/demo` — linked from the navbar, currently 404. (`/sign-up`, `/sign-in` are part of spec 04.)

## Infrastructure Status

None of the following exists yet. All are now specified in `architecture.md` and `code-standards.md`.

| Area | Status |
| --- | --- |
| GitHub Actions workflows | Not started |
| Branch protection and required checks | Not started |
| Preview environment and ephemeral database branching | Not started |
| Migration pipeline and drift detection | Not started |
| Rate limiting provider | Not started |
| Idempotency keys | Not started |
| Health endpoints | Not started |
| Sentry and PostHog wiring | Not started |
| Backup and restore drill | Not started |
| Integration test database harness | Not started |
| Playwright authentication strategy | Not started |

## Open Questions

- **Spec 04 redirect/landing behavior.** `context/feature-specs/04-auth.md` says `/` should redirect authenticated users to `/editor` and unauthenticated users to `/sign-in`. Polyglot has no `/editor` route, and `project-overview.md`'s core user flow requires the landing page to stay reachable by signed-out visitors (sign in, sign up, or demo) rather than force-redirecting them away — the marketing landing page (spec 03) already implements that flow. Neither `/dashboard` nor onboarding exists yet to send signed-in users to. Flagged to the user 2026-08-29; asked whether this unit should skip forced redirects (show signed-in vs. signed-out nav state only) and defer the real post-auth redirect to when `/dashboard`/onboarding exist, or add a redirect to a not-yet-built destination now.
- **Spec 04 unit scope vs. Neon user record.** `architecture.md` requires every authenticated Clerk user to get a corresponding Polyglot user record in Neon, with roles resolved from that authoritative database record — but no database layer exists yet (Infrastructure Status below shows nothing started: no Drizzle, no `db/`, no schema). Asked the user 2026-08-29 whether spec 04 stays Clerk-wiring-only (provider, `proxy.ts` route protection, sign-in/up pages, nav auth controls) with the Neon sync + role resolution tracked as its own follow-up unit, or expands scope to stand up a minimal database layer now.
- **Rate limit store.** `architecture.md` requires rate limiting in v1 behind a provider interface but does not choose the backing store. Candidates: a managed serverless Redis, the hosting platform's key-value store, or a PostgreSQL token bucket. The PostgreSQL option adds no dependency but puts write load on the primary database. Decide before implementing the provider.
- **Integration test database.** Options: an ephemeral branch per CI run, a Dockerized PostgreSQL service container, or an in-process PostgreSQL. Branching gives the highest fidelity; a service container is fastest and works offline. Decide before writing the first integration test, because the choice shapes the test harness.
- **Playwright authentication.** Whether end-to-end tests use the auth provider's testing tokens or a seeded test user with stored authentication state. Decide before the first end-to-end test.
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
- Operational architecture pass (2026-08-29): added environments, CI/CD pipeline, migration strategy, idempotency, rate limiting, scalability and performance, availability and SLOs, disaster recovery, release management, supply chain security, and cost posture to `architecture.md`; invariants 36-48; ADR-011 through ADR-016. Added testing strategy tiers, CI requirements, pull request conventions, migration authoring, idempotency, pagination, feature flags, observability, and performance rules to `code-standards.md`. Added non-functional requirements to `project-overview.md`, interface states and frontend performance budgets to `ui-context.md`, and CI parity, migration safety, non-functional review, and infrastructure change rules to `ai-workflow-rules.md`. All are specification only; no implementation yet.
- No browser-verification skill exists for this repo. Spec 03 installed Playwright ad hoc into a scratch directory, not the project lockfile. Consider capturing this as a project skill if browser checks become routine.
