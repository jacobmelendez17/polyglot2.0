# Progress Tracker

Update after every meaningful implementation change. Record milestones and durable facts only — Git history holds the implementation detail.

## Current Phase

Implementation / feature specs

## Current Goal

Work through `context/feature-specs/` in order. Specs 01–05 are complete.

## Completed

Every unit below passed `tsc`, lint, `npm run test`, `npm run build`, and a real-browser check at desktop and mobile viewports unless noted.

- **Context files** (2026-08-20) — six source-of-truth documents written; cross-file contradictions resolved in an audit.
- **Spec 01 — Design System** (2026-08-21) — shadcn/ui configured with Button, Card, Dialog, Input, Tabs, Textarea, ScrollArea; `lucide-react`; `cn()` at `lib/utils.ts`; `ui-context.md` theme tokens and Shantell Sans wired into `globals.css` and `app/layout.tsx`.
- **Spec 02 — Component Design / base chrome** (2026-08-25) — layout, z-index, and motion tokens added to `globals.css`; `(marketing)` route-group layout; `SiteHeader` (server) with `SiteHeaderScroll` and `SiteNavMobile` client boundaries; `SkipLink`; shadcn `Sheet` added. Vitest and Testing Library were stood up in this unit — 4 tests.
- **Spec 03 — Landing Page body** (2026-08-25) — `app/(marketing)/page.tsx` composed from six server sections in `components/marketing/` (hero, SRS trail, pillars, review preview, practice modes, closing CTA) plus `components/shared/reveal.tsx`. 11 tests total.
- **Spec 03 follow-up — visual pass** (2026-08-25) — decorative hero greetings, greeting marquee, and bob animations added; transform-only and disabled under reduced motion.
- **Spec 04 — Auth (Clerk wiring only)** (2026-08-29) — Clerk linked to a fresh "polyglot2" dev application (the spec's pinned app ID belonged to no account we have access to, and the account's one existing app, "Reverb", was a different project). `proxy.ts` (Next 16's `middleware.ts` replacement) added, public by default, `/__clerk/:path*` in the matcher. `ClerkProvider` wraps `{children}` inside `<body>` in `app/layout.tsx` with a custom `appearance` (`lib/clerk-appearance.ts`) that maps Clerk's theme variables onto Polyglot's own CSS custom properties rather than a generic preset — see Architecture Decisions. `app/(auth)/layout.tsx` is a two-panel sign-in/up shell (form left, wordmark/tagline/feature-list right on `lg:`, form-only below); `app/(auth)/sign-in/[[...sign-in]]/page.tsx` and `.../sign-up/...` render Clerk's components inside it. `SiteHeader` and `SiteNavMobile` now show `SignInButton`/`SignUpButton` when signed out and `UserButton` when signed in, via Clerk's `Show`. No forced redirects — `/` and the marketing pages stay reachable regardless of auth state (no `/dashboard` or onboarding exists yet to redirect to). `lib/env.ts` (Zod, fail-fast) validates the six Clerk env vars; `.env.example` documents them (had to add `!.env.example` to `.gitignore` — the blanket `.env*` rule was silently swallowing it too). Verified with `tsc`/build, lint, `npm run test` (12 tests, +1 for the new signed-in-header case), and a real headless-browser pass covering both signed-out and signed-in header states, the two-panel layout at desktop and mobile viewports, and sign-in/sign-up/sign-out — see Environment Notes for how the CAPTCHA gate on the real form was handled.
- **Spec 05 — Hero handwriting animation** (2026-08-30) — `components/marketing/handwriting-word.tsx` (client) plays a 31-frame preloaded PNG sequence (`public/animations/hero-here/Japanese_Here-{1..31}.png`, copied verbatim from `context/animations-drawn/`, originals untouched) via `requestAnimationFrame` with elapsed-time tracking: `31 → 1`, once, no loop, staying on frame 1. Falls back to visible static text on load failure; jumps straight to frame 1 (no playback) under `prefers-reduced-motion`. The real word is always present as accessible text (`sr-only` while the image plays, a plain visible span in the failure case) so the headline reads as "Fluency begins ここ" regardless of animation state; the image itself is `aria-hidden`. `hero-section.tsx` stays a server component — only `HandwritingWord` is a client boundary. 21 tests total (+4 for the new component, +1 headline-accessible-name check on `HeroSection`). Verified `tsc`, lint, `npm run test`, `npm run build`, and a real-browser Playwright pass (scratch install, same pattern as specs 03/04) confirming the 31→1 sequence, no loop, no layout shift, and desktop/mobile responsiveness — see Open Questions for a pre-existing bug this surfaced in `Reveal`.

## In Progress

None.

## Next Up

1. Real footer — still the spec 02 placeholder.
2. `/about`, `/demo` — linked from the navbar, currently 404.
3. Neon-backed internal user record + server-authoritative role resolution (the `users`/`auth` domain plumbing `architecture.md` describes). Deliberately deferred out of spec 04 — no database layer exists yet. `proxy.ts` has nothing to protect until this and a first authenticated page (e.g. `/dashboard`) exist.

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
| Playwright authentication strategy | Validated manually (see Environment Notes), not wired into a real suite — no `e2e.yml` yet |

## Open Questions

- **Rate limit store.** `architecture.md` requires rate limiting in v1 behind a provider interface but does not choose the backing store. Candidates: a managed serverless Redis, the hosting platform's key-value store, or a PostgreSQL token bucket. The PostgreSQL option adds no dependency but puts write load on the primary database. Decide before implementing the provider.
- **Integration test database.** Options: an ephemeral branch per CI run, a Dockerized PostgreSQL service container, or an in-process PostgreSQL. Branching gives the highest fidelity; a service container is fastest and works offline. Decide before writing the first integration test, because the choice shapes the test harness.
- **Playwright authentication.** `@clerk/testing/playwright`'s `clerkSetup()` + `clerk.signIn({ page, emailAddress })`/`clerk.signOut()` worked cleanly for a real signed-in session in manual verification (2026-08-29) — see Environment Notes. Leaning toward that over a stored-auth-state file, but the real suite (`e2e.yml`, fixture/seed strategy for the test user) still doesn't exist. Decide when building the first end-to-end test.
- **Free-tier level count in marketing copy.** `architecture.md` configures free Levels 1–3, premium Level 4+. Spec 03 instructed that no level count appear in landing copy pending confirmation that the access-tier config is also the public promise. Resolve before the pricing or about pages are written.
- **`Reveal` hydration mismatch under real reduced-motion.** `components/shared/reveal.tsx`'s `resolveInitialVisibility()` reads `matchMedia` directly inside its `useState` initializer, which runs once during SSR (`window` undefined → `false`) and again on the client's very first hydration render (`window` defined → `true` when the OS/browser genuinely has `prefers-reduced-motion` set). React logs a hydration-mismatch warning and does not patch the affected className, leaving every `Reveal`-wrapped section — not just the hero — stuck at `opacity-0`/`translate-y-4` (invisible) for real reduced-motion users. Discovered 2026-08-30 during spec 05's browser verification, using Playwright's `reducedMotion: "reduce"` context emulation; confirmed it is not a spec 05 regression by reproducing the same mismatch on every other `Reveal` instance on the page (Srs/Pillars/ReviewPreview/Practice/Closing sections). Predates this unit — `reveal.test.tsx`'s mock-based unit tests mock `matchMedia` only after render and never exercise a real SSR-then-hydrate pass, so it went unnoticed. Left unfixed pending confirmation, since the fix touches a component shared by every landing section rather than anything spec 05 owns. Likely fix: initialize state to the SSR-safe `false` unconditionally and flip it in a `useLayoutEffect` after mount instead of inside the `useState` initializer.

## Architecture Decisions

- **Client-component boundaries** (2026-08-25) — scroll-driven behavior lives in its own minimal client component (`site-header-scroll.tsx`) so the parent stays a server component. Precedent for any server shell needing one isolated piece of interaction JS.
- **SRS color tokens** (2026-08-25) — `ui-context.md` defines five tokens named by stage (`--srs-beginner` … `--srs-fluent`), not nine. All nine sub-stages group into those five by name. Specs referring to "`--srs-1` through `--srs-5`" mean these.
- **Level-unlock rule sourcing** (2026-08-25) — `project-overview.md` describes the threshold only vaguely; the concrete rule (5/6 of a level's items at Familiar 1 or above) lives in `architecture.md`. `architecture.md` is authoritative for this value.
- **External references do not override the token system** (2026-08-25) — a shared reference implementation used a different palette (`terraza-*`), out-of-scope sections, and pre-Clerk auth calls. Only its decorative approach was adopted; `ui-context.md` remains authoritative for color, scope, and structure.
- **Clerk theming via native `appearance.variables`, not `@clerk/ui`** (2026-08-29) — `04-auth.md` called for `@clerk/ui`'s `shadcn` theme, but installing it pulled in ~350 packages transitively (react-native/metro/Solana wallet-adapter chain) with high-severity advisories, which would fail the `security.yml` CI gate `architecture.md` requires. `lib/clerk-appearance.ts` instead passes `var(--token)` strings straight from `ui-context.md`'s existing tokens into Clerk's `appearance.variables` (`colorPrimary`, `colorBackground`, `fontFamily`, `borderRadius`, etc.) — Clerk resolves these as normal CSS custom properties, so light/dark switches automatically with the rest of the app and no extra dependency is needed. Prefer this pattern over `@clerk/ui` for any future Clerk component theming.
- **`proxy.ts` stays public-by-default** (2026-08-29) — `@clerk/nextjs`'s current scaffold (`clerkMiddleware()` with no route matcher) is public-by-default with per-route `auth.protect()` as an opt-in, not the older global-protect-then-allowlist pattern. Since no authenticated route exists yet, `proxy.ts` has no protection logic — add `auth.protect()` (or a `createRouteMatcher` allowlist, inverted) when the first authenticated page ships, not before.

## Environment Notes

- No `src/` directory. Code lives at root-level `components/`, `lib/`, `app/`.
- npm installs require `--legacy-peer-deps` — the shadcn/babel tree conflicts with `@vitejs/plugin-react`'s optional peer on a Babel 8 prerelease. Installed versions are correct; only peer resolution needs the flag.
- `app/page.tsx` was removed. `app/(marketing)/page.tsx` owns `/`. Do not recreate the former — route groups add no URL segment and the two collide.
- Components reading a media query must set initial state with a lazy `useState` initializer. The effect-driven pattern fails the `react-hooks/set-state-in-effect` lint rule. See `components/shared/reveal.tsx`.
- Decorative keyframes `lp-float`, `lp-bob`, and `lp-marquee` exist in `globals.css`. Reuse them; they are transform-only and already gated behind `prefers-reduced-motion`.
- Operational architecture pass (2026-08-29): added environments, CI/CD pipeline, migration strategy, idempotency, rate limiting, scalability and performance, availability and SLOs, disaster recovery, release management, supply chain security, and cost posture to `architecture.md`; invariants 36-48; ADR-011 through ADR-016. Added testing strategy tiers, CI requirements, pull request conventions, migration authoring, idempotency, pagination, feature flags, observability, and performance rules to `code-standards.md`. Added non-functional requirements to `project-overview.md`, interface states and frontend performance budgets to `ui-context.md`, and CI parity, migration safety, non-functional review, and infrastructure change rules to `ai-workflow-rules.md`. All are specification only; no implementation yet.
- No browser-verification skill exists for this repo. Specs 03, 04, and 05 each installed Playwright ad hoc into a scratch directory, not the project lockfile. Consider capturing this as a project skill (`/run-skill-generator`) if browser checks become routine.
- Decorative/illustration assets (hand-drawn frame sequences, future art) live under `public/animations/<name>/`, one subfolder per asset, filenames untouched from the source export. First used by spec 05's `public/animations/hero-here/`.
- Clerk is linked to the "polyglot2" development application under `nerdalert46@gmail.com` (`clerk whoami` / `clerk doctor` to confirm). No production Clerk instance configured yet — expected; that's a production-environment concern per `architecture.md`'s environments table, not part of this unit.
- Real Clerk sign-up/sign-in forms are Cloudflare Turnstile-gated (`Verify you are human`), so a plain headless-Playwright `fill`-and-submit through the UI won't get past it — that's the bot protection working, not a bug. For automated verification of the signed-in state, use `@clerk/testing/playwright`'s `clerkSetup()` + `clerk.signIn({ page, emailAddress })` / `clerk.signOut({ page })`, which fetches a real testing token via `CLERK_SECRET_KEY` and bypasses the CAPTCHA legitimately. Create the test user first with `clerk users create --email ... --password ... --yes` (delete it after with `clerk api /users/{id} -X DELETE --yes` — the CLI's `users` command has no `delete` subcommand of its own). This is what verified spec 04's signed-in header state.
