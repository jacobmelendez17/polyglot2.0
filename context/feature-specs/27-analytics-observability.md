# Spec 27 — Product Analytics, Observability & Alerting

**Project:** Polyglot  
**Status:** Specification drafted. **Units 27.1–27.3 implemented 2026-10-17, and Units 27.5–27.7 and 27.10 implemented 2026-10-18**; Units 27.4, 27.8, 27.9 and 27.11 **not implemented** (see `progress-tracker.md`)  
**Prepared:** 2026-10-15  
**Highest-priority constraint:** **$0 incremental monthly spend. No paid subscriptions, no usage-based billing, no purchases, and no automatic plan upgrades.**

> **Authority and execution.** Read `project-overview.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, `ai-workflow-rules.md`, and `progress-tracker.md` in that order before implementing a unit. Treat them as the source of truth except for the two deliberately superseded Spec 26 decisions recorded in §2. Inspect the relevant actual repository code before editing. Implement **one unit at a time**, verify it end to end, and update `progress-tracker.md` after each meaningful change. This file defines requirements; it is not permission to provision external services, change a plan, add payment information, migrate production, or deploy to production without the owner's explicit action.

## 1. Goal and approved decisions

Introduce privacy-respecting **PostHog product analytics** and **Grafana Cloud observability** through **OpenTelemetry**, with meaningful dashboards, external uptime checks, and **email alerts**, without changing Polyglot's modular-monolith architecture or authoritative learning behavior.

### 1.1 Approved product decisions

| Concern                   | Requirement                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Product analytics         | PostHog **Free** only                                                                                                           |
| Operational observability | Grafana Cloud **Free** only                                                                                                     |
| OpenTelemetry             | Instrument application operations; export metrics, sampled traces, and sanitized application logs                               |
| Prometheus                | Use Grafana Cloud's Prometheus-compatible metrics backend; **do not self-host Prometheus**                                      |
| Session replay            | **Disabled** throughout Spec 27                                                                                                 |
| Product-event consent     | Explicit opt-in, default off; authenticated preference persists **server-side across devices**                                  |
| Lesson abandonment        | **Derived** when an analytics-observed lesson start has no matching completion within **24 hours**                              |
| Dashboards                | Native PostHog and Grafana dashboards; authorized links from Polyglot; no embedded reporting system                             |
| Admin Logs                | Keep existing PostgreSQL-backed **Audit** tab; replace **System** placeholder with operational links/status explanations        |
| Alerts                    | **Email** contact point initially; no Slack/webhooks or paid incident-response tooling                                          |
| Alerts rollout            | Initial availability/failure thresholds below; calibrate latency alerts from measured baselines                                 |
| Sentry                    | Preserve documented error-monitoring boundary; do not assume it is installed or expand this spec into a separate Sentry rollout |
| Environments              | Development, preview, production isolated through existing `APP_ENV` conventions                                                |
| Budget                    | **Never spend money as part of Spec 27.** Free-account usage limits are hard external boundaries.                               |

### 1.2 Outcomes

- Measure meaningful consented learner engagement: onboarding, lessons, reviews, practice, progression, and dashboard preferences.
- Detect application downtime, review submission failures, unexpected API failures, and database problems.
- Correlate sanitized logs and traces with requests and critical operations.
- Provide useful native dashboards and actionable email notifications.
- Preserve all learning and administrative invariants even when telemetry providers are down or capped.

### 1.3 Excluded scope

No paid tier, paid add-on, credit card, invoicing configuration, paid Vercel Drain, Vercel Pro upgrade, paid custom domain, separately hosted Prometheus/Alloy/collector, new always-on compute instance, Kafka/queue solely for analytics, session recording, click autocapture, automatic pageviews, advertising analytics, tracking of raw answers or journal text, Grafana dashboard embedding, client-side Grafana credentials, migration of authoritative audits to PostHog, or historical analytics backfill from private learning records.

## 2. Reconcile with source-of-truth files

1. **Architecture unchanged:** one Next.js App Router modular monolith on Vercel, one Neon/Postgres authority, Clerk identity, domain/application services, Drizzle ORM, existing provider boundaries. Analytics never determine SRS stages, eligibility, XP, progression, authorization, or transaction outcomes.
2. **Existing Spec 24 foundation must be reused:** `lib/logging/` already includes a structured JSON logger, `AsyncLocalStorage` request context, `withTrace` operation timing, redaction, route tracing, and client-error extension points. Do **not** create a second unrelated logger or trace context. Bridge existing `requestId`/operation identity to OTel; add valid OTel trace/span IDs where applicable without changing existing idempotency semantics. The existing application trace ID is not assumed to be a syntactically valid OTel trace ID.
3. **Explicit override to Spec 26:** earlier notes say to delete `/admin/logs` with PostHog. The owner has now selected **keep Audit; replace System**. Preserve the current audit page, `GET /api/v1/admin/logs`, exact cursor pagination, authorization, audit services, audit data, and existing audit tests. Update `architecture.md` and `progress-tracker.md` to record this superseding decision when implementing the relevant unit.
4. **Provider readiness is not assumed:** the progress tracker marks the health endpoints not started, and Sentry/PostHog provider wiring not started. Verify actual code and account configuration in the implementation session.
5. **Established reliability targets remain:** 99.5% monthly availability, 99.9% successful eligible well-formed review submissions, fewer than 0.1% unhandled request failures.
6. **Established performance budgets remain:** review-submit server p95 < 300 ms, due-review query p95 < 100 ms, dashboard server p95 < 500 ms, LCP p75 < 2.5 s, INP p75 < 200 ms, fewer than 10 database queries/request. These are the existing budgets, not invented new ones. Baseline calibration applies to **when to alert**, not to whether these budgets exist.
7. **Settings UX:** any persisted analytics-consent setting uses existing settings persistence patterns and the established always-visible Save/Cancel UI conventions, keyboard access, and Polyglot color/theme tokens.

## 3. Hard $0 cost policy and provider setup gates

**This section overrides convenience. If a requirement cannot be delivered without payment, disable or postpone that requirement and record the blocker. Never pay, start a paid trial with automatic conversion, add billing details, or upgrade a plan without a separate explicit owner authorization.**

### 3.1 Verified provider free limits (2026-10-15; reverify at configuration time)

| Provider                       | Free allowance relevant to Spec 27                                                                       | Mandatory account condition                                                                                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostHog Cloud                  | 1,000,000 product analytics events per month; one free project                                           | **Free plan, no payment card.** Events over the Free allowance are dropped; do not switch to pay-as-you-go.                                                                                                                         |
| Grafana Cloud                  | 10,000 active metrics series, 50 GB/month logs, 50 GB/month traces, 14-day retention, three active users | **Free plan, no payment card.** No Grafana Pro, Advanced, add-on, trial-to-Pro, or paid retention.                                                                                                                                  |
| Grafana Synthetic Monitoring   | 100,000 API test executions/month included in Free                                                       | One 5-minute HTTP API check by default; verify total execution count, including probes/regions.                                                                                                                                     |
| OpenTelemetry                  | Open-source API/SDK                                                                                      | No license fee; SDK/export traffic still consumes application and provider allowances.                                                                                                                                              |
| Vercel                         | Use existing permitted free/Hobby features only                                                          | **No paid Drains, Observability Plus, or Pro** introduced. **Hobby is restricted to noncommercial personal use**; if Polyglot use becomes commercial, pause and report hosting-plan incompatibility rather than silently upgrading. |
| Neon / other existing services | Existing approved environment and quota only                                                             | No new paid branch, database size increase, scheduler, or external service without verifying existing free allowances.                                                                                                              |

Official provider references: [PostHog pricing](https://posthog.com/pricing), [Grafana pricing](https://grafana.com/pricing/), [Grafana signup limits](https://grafana.com/get/), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Vercel fair-use rules](https://vercel.com/docs/limits/fair-use-guidelines).

**Do not assert that the user's existing Vercel, Neon, AWS, Clerk, or other accounts are already free**—that cannot be established from these uploaded documents. Spec 27 must incur **no new charges**; existing unrelated account costs are outside this feature's scope.

### 3.2 Provisioning gate — must pass before live export

- Owner confirms PostHog account is **Free** (not pay-as-you-go) and contains **no billing/payment method**.
- Owner confirms Grafana Cloud account is **Free**, not Pro, and contains **no billing/payment method**.
- Owner reviews Vercel plan eligibility and current hosting/resource usage; no upgrade is requested or made.
- Owner checks that the existing Neon plan and branch/connection resources support any additional small summary table and any daily scheduled work free of new charges.
- Every new monitoring dependency/service is listed with a $0 price and the relevant free-tier limit. If uncertain or over-limit, **do not activate it**.
- Do not enroll in a time-limited paid trial merely to access a free feature. If signup automatically starts a trial, ensure the eventual account will remain Free with no card; treat trial-only capabilities as unavailable.

### 3.3 Collection limits and degradation

- Production PostHog uses **only explicitly named** events. Disable `autocapture`, automatic pageview/pageleave, session replay, heatmaps, and other product capture not specified here.
- Favor event counts at actual successful business boundaries, not every keystroke or render. Do not emit high-volume debug events to PostHog.
- Grafana metric series must use a fixed label allowlist and remain well below 10k; target **< 1,000 series** for the initial dashboards.
- Default application tracing to **5% head sampling** for ordinary requests, configurable down to 0. Critical-operation metrics remain unsampled. Sampling must not record sensitive payloads.
- Export only allowlisted logs. Default to **WARN/ERROR** operational logs plus a deliberately small allowlist of INFO completion/failure diagnostics; no DEBUG log shipping in production.
- Limit exported log size (suggested **2 KiB serialized** per event; truncate or drop rather than leaking content). Bound exporter batch sizes, retry attempts, queue memory, and flush overhead.
- Monitor provider-reported monthly consumption and document how the owner checks it. At ~50%/75% of any quota warn in deployment notes/dashboards; reduce sampling or disable that optional signal well before Free limits. Do not claim an app-local counter is a global hard cap across serverless instances.
- The **provider Free account**, with no payment method or paid billing authorization, is the actual no-charge backstop. If quota or exporter availability is uncertain, telemetry may be dropped and dashboards become partial; learner operations must continue.
- Any design requiring paid functionality is a failed acceptance test, not an invitation to increase the budget.

## 4. Domain boundary and configuration

- Product analytics code lives under the existing `domains/analytics` / `providers/analytics` boundary, with typed event contracts and strictly controlled client/server adapters.
- Observability export is a provider-boundary extension around the existing `lib/logging` and operation-tracing components. No domain rule may depend on Grafana/PostHog SDK APIs.
- Central `lib/env.ts` (or the actual existing typed environment module) validates optional analytics/telemetry variables and existing `APP_ENV`. Server credentials never use `NEXT_PUBLIC_`.
- **Prefer no direct browser PostHog SDK at all in v1**, since autocapture and session replay are disabled: browser-originated event intents go through a first-party, authenticated, validated endpoint that rechecks authoritative server consent and then uses the server PostHog adapter. If a browser SDK is justified during implementation, it may receive only the PostHog **public project token** and public ingestion URL, must default opt-out, and must not bypass the server consent gate. Never expose a Grafana OTLP key, PostHog private API key, or Clerk secret.
- Production telemetry is enabled by an explicit feature flag/configuration plus valid credentials. Development, unit, integration, E2E, and preview environments default to no-op adapters. An intentional preview verification may be enabled separately **without polluting production PostHog metrics**.
- If a configuration flag says disabled, **no outgoing provider requests** may occur. If enabled with missing/invalid credentials, fail closed for that telemetry provider and report sanitized configuration diagnostics; **do not block application startup for optional telemetry**. This is a deliberate exception to mandatory core-service startup validation.
- `.env.example` must explain every added setting with placeholders, its server/browser scope, and its safe default. Secrets are not committed.
- Maintainable dashboards, alert rules, synthetic checks, and their identifiers should be documented or exported as version-controlled configuration where supported on Free; avoid a dependency on paid infrastructure-as-code automation.

## 5. Consent contract

### 5.1 Account consent

- Add an explicit **Analytics** consent preference under existing Settings, using established save/cancel and accessibility patterns. Do not alter appearance settings behavior.
- Authenticated learner consent persists in authoritative Polyglot settings (account-wide, not per language and not merely browser storage): `unknown`, `accepted`, or `declined` (implementation may use a nullable boolean if behavior is equivalent), `updated_at`, and `policy_version`.
- New/unknown accounts default to **off**. No prechecked opt-in, bundled consent, or analytics requirement for learning.
- Reuse existing user-settings schema where appropriate. Otherwise use a **small additive, backward-compatible Drizzle migration**, with a default that denies capture. Do not edit a previously merged migration.
- On any new device or session, load the authoritative preference before allowing provider capture. No analytics emission during initial loading. Every server-side capture—including browser-originated event intents—rechecks the latest server preference; do not trust a client-supplied consent flag. Use a first-party capture endpoint as the default for browser-originated events so a second device with stale UI cannot directly transmit PostHog events after account-wide revocation.
- Saving consent is authenticated, validated, authorized to the current account, and protected by existing mutation security. A revoked device/session cannot restore an outdated decision silently.
- Signing out resets PostHog identity locally. Switching accounts must not transfer anonymous identity or merge unrelated people without explicit consent.
- Consent withdrawal immediately disables local capture and queued unsent browser events; the server consent gate refuses any newly received event after the revocation commits, including events from other devices. In-flight events already accepted before the commit may still be delivered; fully retroactive cancellation cannot be guaranteed. Already delivered events are **not automatically erased** by revocation; disclose this and provide the provider-deletion process where applicable.
- Do not place raw account emails, names, Clerk IDs, login tokens, or sensitive learning content into PostHog profiles or properties.

### 5.2 Anonymous visitors

- **No anonymous product-event capture in initial Spec 27.** Logged-out visitors, including public landing and demo visitors, generate no PostHog events. This avoids inventing a second visitor-consent/cookie identity system and avoids additional event volume.
- On sign-in, the account's server-authoritative choice controls tracking; an old device-local setting cannot silently grant account consent. Any future anonymous consent/capture is a separately approved feature.

### 5.3 Identity, deletion, and testability

- Prefer a random, stable analytics-only pseudonymous ID associated with the Polyglot account instead of its Clerk identity. Any required field is additive and must be deleted with the account. It may be visible to the browser after authenticated, consented resolution, but cannot authorize actions.
- Document the vendor project/person deletion workflow for account deletion. Never block deleting a Polyglot account because an analytics-provider deletion request fails; record safe follow-up state if required.
- Provide unit/integration/E2E tests for unknown, accept, reject, revoke, simultaneous devices (including stale consent on device B), sign-in, sign-out, account switch, and deletion-path integration. Mock vendor traffic by default. Client intents must be validated, rate limited, authorized, and current-consent-checked at the first-party capture endpoint.
- Do not claim compliance with a specific jurisdiction's law simply from these mechanics; review privacy notice and applicable consent obligations before a public deployment.

## 6. PostHog event contract

### 6.1 Approved v1 catalog

All event names **snake_case**, centralized as typed constants with Zod-validated fixed properties.

| Event                      | When to emit                                          | Authority                                                           |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| `onboarding_started`       | Consented user truly enters onboarding                | Browser intent via consent-gated first-party endpoint               |
| `onboarding_completed`     | Onboarding completion is persisted                    | Server, after success                                               |
| `lesson_started`           | Consented user starts an ephemeral lesson session     | Browser intent via consent-gated first-party endpoint; once/session |
| `lesson_completed`         | All-or-nothing lesson enrollment commits              | Server, once/logical completion                                     |
| `review_session_started`   | Review session starts                                 | Browser intent via consent-gated first-party endpoint               |
| `review_item_completed`    | Atomic item review commits (not per answer direction) | Server                                                              |
| `review_session_completed` | Session completion is unambiguously known             | Actual owning service/client flow, verified before instrumenting    |
| `practice_started`         | Practice session begins                               | Browser intent via consent-gated first-party endpoint               |
| `practice_completed`       | Practice completion is saved                          | Server                                                              |
| `level_unlocked`           | Authoritative unlock state commits                    | Server                                                              |
| `dashboard_widget_added`   | Dashboard configuration saves addition                | Server                                                              |
| `dashboard_widget_removed` | Dashboard configuration saves removal                 | Server                                                              |

Do not add generic `feature_opened`, `setting_changed`, every-click, or raw answer events opportunistically. Any new event needs a documented reason, schema, owner, and privacy review.

### 6.2 Fields and forbidden content

Approved common properties: `language` (configured locale code), `app_environment`, `event_schema_version`, bounded `source`/feature/operation enum. Approved per-event numeric/categorical properties may include `level`, `item_count`, `duration_seconds`, `practice_type`, `lesson_type`, `accuracy_percent` (aggregate only), `srs_stage_before/after` (category only). Define a strict schema per event; no arbitrary spread from action payloads or database objects.

Never export raw typed answers, lesson texts, vocabulary labels, grammar passages, journals, recordings, private notes, emails, IP-address fields, auth tokens, raw current URL/query string, or internal user data dumps. Disable or sanitize PostHog automatic geo/IP enrichment if the project's privacy controls allow it. Use no user IDs in operational metrics.

### 6.3 Commit timing, replay, and accuracy

- Reuse existing application-service and `withIdempotency` boundaries for lesson and review completions. A failed or rolled-back mutation produces **no success event**.
- A completed review item is one transaction boundary; do not claim a full review session is one transaction. Partial bidirectional answers produce **no** `review_item_completed`.
- Duplicate/stale submissions and idempotent replays must not deliberately enqueue a second logical success event. Use an event/deduplication key where supported; accept that best-effort remote delivery is not mathematically exactly once.
- External delivery happens after the authoritative result is established. Do not await analytics in the critical response path or extend the database transaction for it. Use a serverless-compatible post-response flush/lifecycle proven by tests; do not assume an unawaited promise survives a Vercel function ending.
- A vendor outage may drop an event, **never** roll back or reject the learner's successful action.
- Analytics provide estimates only for opted-in learners. They cannot replace authoritative database counts or account progress.

### 6.4 Lesson abandonment (24 hours)

- **Derived metric only:** a `lesson_started` observed in PostHog has no correlated `lesson_completed` within 24 elapsed hours. No `lesson_abandoned` mutation or job that changes learner state.
- A non-sensitive ephemeral analytics session correlation key can associate start/completion where available. Do not persist unfinished lessons or create authoritative unfinished-session tables; existing lessons are explicitly ephemeral and restart on reload.
- Funnel time window is 24 hours; report after the window matures. Distinguish started sessions from unique people; define chart denominators and consent bias.
- Loss of events, changed consent, or abrupt logout may yield incomplete correlations. Label this as **estimated abandonment**, not guaranteed behavior. If correlation cannot be implemented safely, mark the funnel incomplete rather than silently switching to user-level matching that confuses separate sessions.

## 7. OpenTelemetry, metrics and traces

### 7.1 Integration requirements

- Use the actual supported Next.js Node.js instrumentation entry point and a compatible OTel SDK/exporter; inspect installed versions and current Sentry availability before adding dependencies.
- Export via Grafana Cloud's **HTTPS OTLP endpoint** with authenticated server-only credentials. Grafana OTLP paths for metrics, logs, and traces are supported; never proxy inbound arbitrary user data to the endpoint.
- No new continuously running collector, VM, Kubernetes service, or paid Vercel Drain. **Direct OTLP export is best-effort in serverless**; bound timeouts and verify actual exported signals in a deployed, free environment.
- Reuse `lib/logging/trace-context.ts` request identity and `withTrace`. Preserve existing call semantics and tests. Correlate structured log record `requestId` with OTel valid trace/span IDs when available.
- Avoid two independent root instrumentations or duplicated spans if/when Sentry is installed. If the exact SDK combination is incompatible, fail that telemetry unit safely and record the blocker; do not rip out Spec 24 logging.
- Do not emit telemetry of potentially sensitive request/response bodies or query strings. Normalize route templates rather than label dynamic route values.

### 7.2 Metric catalog

Names shown are logical; use OpenTelemetry semantic conventions as applicable, with one documented namespace and units.

| Signal                              | Dimensions allowed                                  | Meaning                                                                            |
| ----------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `http_server_requests_total`        | environment, method, normalized route, status_class | Eligible served requests                                                           |
| `http_server_request_duration_ms`   | environment, normalized route, operation            | Request latency histogram                                                          |
| `review_submission_total`           | environment, outcome, safe error_category           | Accepted/succeeded/expected_rejected/unexpected_failed; separate attempt semantics |
| `review_submission_duration_ms`     | environment, outcome                                | Duration of review submission operation                                            |
| `lesson_completion_total`           | environment, outcome                                | New authoritative lesson completions/failures                                      |
| `practice_completion_total`         | environment, practice_type, outcome                 | Saved practice completions/failures                                                |
| `database_operation_duration_ms`    | environment, operation enum, outcome                | Bounded Neon query/transaction timings                                             |
| `database_connection_failure_total` | environment, provider                               | Connection failures                                                                |
| `telemetry_export_failure_total`    | environment, signal                                 | Internal aggregated diagnostics, without recursively exporting on exporter failure |

Use safe labels only; **never** label metrics with user, session, learning-item, raw URL, trace/request ID, arbitrary exception text, or SQL. Do not double-count success on retries. Histograms require documented bucket units and a bounded series count.

### 7.3 Tracing

- Create spans around actual application operations: review submission, lesson completion, due-review query, practice completion, curriculum import commit, and provider/database calls that materially affect their latency.
- Include bounded safe operation names, outcome classifications, duration, error category, and environment—not raw learner data.
- Ordinary spans default to 5% head sampling; do not promise complete error traces from a head sampler. Keep error counters unsampled; Sentry, when separately installed, remains the full error-reporting boundary.
- Confirm an incoming request and its nested operation appear in the same trace where appropriate. Child traces never alter SRS transaction behavior.

## 8. Sanitized application log export

- Grafana receives **sanitized application-generated log projections** from the existing structured logger, not a raw stdout stream and not every Vercel platform log.
- Export adapter uses an explicit field allowlist, e.g. `timestamp`, `severity`, `environment`, `release`, `service`, `operation`, normalized `route`, `outcome`, safe `error_code`, random request/trace correlation IDs, and bounded duration. Use the existing redactor **plus** positive validation/field selection; key-name redaction alone is not sufficient.
- Explicitly exclude message bodies, arbitrary error strings, stack traces, exception causes, cookies, headers, authorization fields, emails, user IDs, request/response payloads, SQL literals, journal/answer text, and raw resource IDs from external logs. Local structured diagnostic logs retain existing behavior, subject to existing redaction standards.
- OTel JavaScript logs APIs/exporters may be less stable than traces/metrics: verify the chosen versions and security behavior, pin compatible versions, and isolate them behind a provider adapter rather than weakening the privacy contract.
- Export errors are silent with respect to the learner; local diagnostics must be bounded to prevent log/trace recursion and runaway costs.
- Prove with malicious/sensitive fixture payloads that they cannot appear in serialized OTLP logs. Test logging under a Grafana outage and under a full exporter buffer.
- Tracing and logs must be queryable together by a safe correlation ID in Grafana for a deliberate non-production failure test.

## 9. Health, SLIs, SLOs, and availability

### 9.1 Endpoints (documented in architecture; currently not started)

- `GET /api/health`: public **liveness** only. Fast, non-cached response if application serves; no database/provider lookups. Do not leak build internals.
- `GET /api/health/ready`: public **readiness**, bounded timeout to Neon and mandatory critical configuration. PostHog/Grafana outages are **not** readiness failures. Do not expose credentials or detailed dependency errors.
- Rate limit sensibly without making the authorized external synthetic probe fail spuriously. Use `Cache-Control: no-store`; test correct 200/503 response semantics and no cross-environment data access.
- Add isolated, deterministic unit/integration/E2E tests; never run outage injection against production data.

### 9.2 Synthetic checks

- One production HTTP synthetic check for `/api/health`, **every 5 minutes**, using one selected probe location initially, expected HTTP 200, suitable timeouts, and a normalized target URL. A 31-day month implies roughly **8,928** 5-minute executions per location if one execution per interval; provider accounting may differ—verify its displayed usage.
- Keep test executions below Grafana Free **100k/month**. Adding probe regions or browser synthetics requires an explicit free-usage review.
- Readiness is used in deploy verification and optional bounded external checks only after accounting for quota and database-load impact.

### 9.3 Precise SLO/SLI definitions

| SLO                   | Target                    | Numerator / denominator                                                                                                                                                                                   |
| --------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Availability          | >= 99.5% / calendar month | Successful scheduled valid synthetic checks / all valid scheduled checks, with missed/no-data reported separately                                                                                         |
| Review submission     | >= 99.9%                  | Newly committed valid authorized eligible review submissions / all newly evaluated valid authorized eligible review submissions; exclude expected auth/validation/stale rejections and idempotent replays |
| Unexpected error rate | < 0.1%                    | Unhandled application request failures / eligible handled application requests; exclude health checks, expected 4xx validations, and known rejected auth                                                  |

- Record UTC timestamps and an explicit UTC calendar-month reporting window; explain partial windows and insufficient traffic.
- Do not mark an SLO green when data is missing or export fails. Distinguish true zero requests from no telemetry.
- Preserve existing performance budgets from §2; use p95 and p75 histograms/measurements with valid sample-size context.

### 9.4 Fourteen-day retention and monthly reporting

Grafana Cloud Free's 14-day telemetry retention cannot independently prove a complete 28–31-day monthly SLO after old raw data expires. **Do not claim it can.**

- Preferred free-only path: store small **daily aggregate SLI counts** and sufficient provenance in the existing Neon database, using a reviewed **additive** migration and an idempotent bounded daily rollup. This stores counts only, never per-request or personal telemetry. Do not use these aggregates for learning authorization/progress.
- Source daily availability counts from the actual synthetic-monitoring results rather than treating Polyglot's own internal request metrics as an external uptime measurement. Confirm the free account permits necessary query/API access and calculate from returned source evidence. If not possible for free, **do not fabricate uptime figures**: require an explicitly labeled manual daily/weekly recorded export, and report monthly SLO coverage incomplete until collected.
- Daily automation, if used, must fit **Vercel Hobby's once-daily cron frequency** and the owner's existing free database/function budget; secure its endpoint with a secret and duplicate-safe date keys. If owner has a paid or commercially incompatible hosting plan, this spec **does not authorize changing it**. If scheduled automation or API access requires payment, defer it and mark monthly reporting unverified.
- Provide an export/recovery procedure for accidental skipped rollup days; show coverage/missing intervals, not imputed success.

## 10. Alert contract and email delivery

| Alert                     | Initial non-production-tested condition                                                                   | Severity                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `application_unavailable` | Three consecutive external synthetic failures                                                             | Critical                                                   |
| `review_submit_failures`  | >= 2 unexpected review-submission failures / 15 minutes                                                   | Critical                                                   |
| `database_connectivity`   | Repeated database connection failures sustained ~5 minutes                                                | High                                                       |
| `http_5xx_rate`           | > 5% errors over 15 minutes **and >= 20 eligible requests**                                               | High                                                       |
| `review_latency`          | Existing p95 budget measured, alert cutoff calibrated after a real baseline; do not guess a new fixed SLO | Warning                                                    |
| `telemetry_absent`        | Previously expected production telemetry absent beyond documented quiet period                            | Warning / No Data, not falsely labelled 'application down' |

- Use **Grafana Cloud Free** alerting and an **email** contact point. No premium incident-response feature, paging vendor, paid SMTP provider, or external webhook.
- Configure group keys, reasonable evaluation periods, repeat suppression, recovery/resolved email, routing to an owner-approved address, and safe details (environment, operation, severity, timestamp, dashboard link).
- Empty data, evaluation errors, and real outages are different alert states; choose/test handling explicitly.
- Validate by simulating a failure on an isolated/non-production endpoint and confirming receipt of both triggered and resolved email; **never perform failure injection against production**.
- Do not claim email notification is working from a saved configuration alone. Record actual received test evidence and Free-plan eligibility.

## 11. Dashboards and admin navigation

### 11.1 PostHog (external native dashboards)

- **Learner Overview:** unique consenting active learners (daily/weekly), onboarding started/completed, return behavior; clear consent bias notice.
- **Learning Engagement:** lessons started/completed, review item completions and review-session completion when reliable, practice adoption by safe type, level unlocks, widget choices.
- **Lesson Funnel:** 24-hour _estimated_ abandonment with correlation limitations and mature-window reporting.
- Definitions must specify event names, unique-user versus session counting, attribution window, timezone, and consented population.

### 11.2 Grafana (external native dashboards)

- **Application Health:** synthetic uptime, 5xx, request rate, p50/p95/p99 durations, no-data markers.
- **Learning Reliability:** well-formed review submission success SLI, lesson completion outcome, p95 review latency, known performance budgets.
- **Dependencies and Logs:** safe database timings, connection failures, sanitized logs, traces with correlation and explicit data retention.
- **Quota Watch:** visible provider usage paths / owner's documented steps for inspecting Grafana and PostHog Free quotas; no invented in-app meter claiming global provider usage.

### 11.3 Polyglot admin UI

- Keep `/admin/logs` **Audit** tab and its current React Admin read model, filters, exact timestamp cursors, and underlying audited data. No audit deletion or migration to analytics.
- Replace **System** placeholder with small themed operational links/status explanations to Grafana Cloud dashboards, email-alert setup location, and Sentry **only if actually configured**.
- Add an **Analytics** external link or small admin resource to PostHog native dashboards. Do not embed private iframe dashboards and do not expose provider secrets in client bundles.
- Existing `canUseDeveloperTools` authorization (Admin and developer, not writer/learner) applies at Polyglot route/menu/server boundaries; external vendors independently require their own login and permissions. Retain existing admin navigation consistency tests.
- All UI must use the app's warm light/dark semantic tokens, mobile layout, keyboard support, and standard loading/empty/error/permission behavior. No generic SaaS redesign.

## 12. Security, data lifecycle, environment policy

- Default deny product analytics before explicit consent; operational signals do not carry direct learner identity.
- Event-property allowlists, log export allowlists, and trace-attribute allowlists are **three separate enforcement points**, each unit-tested.
- SRS, curriculum, and audit data stay in Neon. Neither PostHog nor Grafana is authoritative, and their outages never modify learning results.
- No vendor private credentials in client source, browser storage, error payloads, analytics properties, Git, or logs. Use separate token scopes; use least privileges and rotate/revoke if exposed.
- Use `APP_ENV`, not `NODE_ENV`, to control provider collection and label environment. Production must never contain preview/test events. Prefer the single allowed free PostHog project for production and disabled nonproduction capture; Grafana environment labels remain bounded.
- Consent withdrawal stops _future_ capture but does not automatically delete historical vendor records; document data deletion requests and provider retention. Privacy notice and applicable legal review must be completed before turning on live capture.
- No site navigation dependency on third-party scripts: lazy-load/minimize browser SDK, preserve SSR, accessibility, and learner performance budgets.
- If a dependency is degraded or over the Free limit, turn off optional collection; do not fail health checks/readiness solely due to PostHog/Grafana.

## 13. Implementation units — one at a time

Each unit must begin with a concise plan: files/boundaries, dependencies, schema impact, verification. Do not implement subsequent units without a fresh instruction to proceed. **Only one unit is implemented and verified per coding iteration** unless the owner explicitly changes that rule.

| Unit      | Dominant outcome                                                                                | Schema/migration                                                          | Required verification                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **27.1**  | $0 provider/config contract, env templates, disabled/no-op adapters and free-tier setup runbook | No                                                                        | Tests: disabled = zero network; invalid optional credentials do not break app; provider-plan gates documented                                                                                     |
| **27.2**  | Server-authoritative cross-device analytics consent and Settings control                        | Additive only if necessary                                                | Consent/role/device/revoke concurrency tests, E2E keyboard/light/dark/390px; no capture before accept                                                                                             |
| **27.3**  | Typed PostHog adapter and approved learning events                                              | Prefer no new domain tables beyond 27.2                                   | After-commit/replay/rollback test matrix; zero private fields; provider outage does not change SRS/lessons                                                                                        |
| **27.4**  | PostHog native event/funnel dashboards including 24-hour estimated abandonment                  | No                                                                        | Consented synthetic test cohort; matching sessions, funnel window, missing-data and opt-out behavior                                                                                              |
| **27.5**  | OTel metrics and sampled traces bridged to existing Spec 24 instrumentation                     | No                                                                        | Provider stub tests + actual nonproduction trace and metrics in Grafana; no double tracing or extra mutation latency                                                                              |
| **27.6**  | Allowlisted sanitized log projection and OTLP logs export                                       | No                                                                        | Sensitive-fixture mutation/security tests; actual Grafana log query and request/trace correlation; bound queue                                                                                    |
| **27.7**  | Implement liveness/readiness endpoints and one free synthetic probe                             | No                                                                        | API unit/integration/E2E checks; external measured success/failure; rate-limit safety; free test usage                                                                                            |
| **27.8**  | Grafana operational dashboards and email alert rules                                            | No                                                                        | Query definitions validated, triggered/resolved email proof, no-data handling, quotas                                                                                                             |
| **27.9**  | Monthly SLO reporting under 14-day retention                                                    | Small additive daily-count table **only after verifying $0 resource use** | Idempotent day aggregation, missing intervals, month boundaries, external uptime evidence; if free automation unavailable, documented partial/manual alternative and explicit not-verified status |
| **27.10** | Admin System tab replacement and Analytics external navigation; Audit preservation              | No                                                                        | Role matrix, audit paging/filter regression, safe link/auth, light/dark/mobile accessibility E2E                                                                                                  |
| **27.11** | Consolidated regression, cost/privacy sign-off, docs and runbook                                | Only corrections needed                                                   | Full required CI checks and representative deployment tests; no new charge or card; usage/retention verification                                                                                  |

### 13.1 Cross-unit rules

- New configuration is **opt-in** and has a tested no-op mode. A unit must leave the existing application operational with subsequent units absent.
- No destructive migration or schema rewrites. Review generated migrations and maintain compatibility with the previously deployed application.
- Preserve production/preview/development/test Neon branch isolation; never test against production user data.
- Test real calls only in a deliberately selected nonproduction environment with zero-cost credentials; no external-service dependency in the standard Vitest/Playwright pipeline.
- Keep telemetry off for tests unless an explicit isolated integration case injects its own controlled fake/recording provider.
- Update source documentation as each approved architecture decision becomes implemented; record any remaining mismatches in `progress-tracker.md` rather than silently changing scope.

## 14. Required acceptance and adversarial test matrix

A release cannot be reported complete without **both automated test evidence and appropriately approved real-provider verification**.

| Scenario                                                                | Required outcome                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| No consent; unknown consent; stale or failed consent fetch              | No PostHog product requests/identification                                                                               |
| Accept on device A, open device B                                       | B observes server-authoritative accepted preference before capture                                                       |
| Revoke on A, use B                                                      | B must revalidate state before future server emission; browser stops on refresh/sync; document delivery race caveat      |
| Logout or switch accounts                                               | Reset identity; no merge of unrelated learners                                                                           |
| Client sends arbitrary event fields / malicious payloads                | Strict schemas reject unapproved or sensitive fields                                                                     |
| Valid lesson commits                                                    | One logical `lesson_completed` event requested for capture, only with consent                                            |
| Lesson completion rolls back                                            | No success event; no partial SRS enrollment                                                                              |
| Review item only half answered                                          | No SRS mutation and no `review_item_completed`                                                                           |
| Idempotent replay / stale completion                                    | No second logical success, no duplicate SRS mutation                                                                     |
| PostHog down or Free quota reached                                      | Learner action still succeeds; analytics drops without retry storm or bill                                               |
| Grafana/OTLP down / short-lived Vercel function ends                    | User responses unaffected; bounded retries/memory; exporter behavior documented                                          |
| Export a simulated secret, email, raw typed answer, journal, SQL string | Not present in PostHog, logs, metrics, or trace attributes                                                               |
| Very high route/ID cardinality                                          | Bounded metric series; no raw paths or identifiers as labels                                                             |
| HTTP health responds but Neon is down                                   | Liveness remains independent; readiness fails sanely; no sensitive error details                                         |
| Synthetic monitor outage/recovery in isolated test                      | Alert fired and resolved, with email actually received                                                                   |
| Low traffic and missing telemetry                                       | Alert/dashboard states distinguish low volume, no data, and failure                                                      |
| Production Grafana metric/log/trace demo                                | All three signals seen and queryable in approved Free account                                                            |
| Dashboards with opted-out users                                         | Product figures explicitly show consenting cohort, not false total counts                                                |
| 24-hour abandonment test with clock fixtures                            | Count only matured observed starts; no changes to unfinished lesson behavior                                             |
| Monthly SLO view past 14 days                                           | Supported by dated daily evidence or clearly marked incomplete, never fabricated                                         |
| Writer/learner tries admin System/Analytics                             | Server/page permissions refuse access                                                                                    |
| Existing Audit pagination/filters/role behavior                         | Unchanged and verified                                                                                                   |
| Local/test/preview run without vendor credentials                       | Runs cleanly, no paid providers or provider network traffic                                                              |
| Free-tier cap approached or exceeded                                    | Optional signal dropped or disabled, no account upgrade or charge                                                        |
| Comprehensive CI checks                                                 | Typecheck, lint, format, targeted unit/integration/E2E, build, full/batch suites per workflow; report any skips honestly |

## 15. Final zero-charge release gate

Before configuring any live provider or declaring Spec 27 done, explicitly record all items below as **PASS**, **BLOCKED**, or **NOT VERIFIED**. A blocked/unverified $0 cost gate prohibits enabling that part of the feature.

- [ ] PostHog organization is **Free**, no billing card, pay-as-you-go disabled/not enrolled.
- [ ] Grafana Cloud stack is **Free**, no billing card, no Pro/trial-only dependencies.
- [ ] No paid Vercel Drain/Observability Plus/Pro/paid hosting feature introduced.
- [ ] Vercel Hobby **noncommercial eligibility** reviewed; any commercial mismatch escalated rather than worked around with payment.
- [ ] No new paid Neon, AWS, Clerk, monitoring, domain, SMTP, or storage resource introduced.
- [ ] Signals stay below approved free quotas; provider usage pages checked and recorded.
- [ ] Disabling PostHog/Grafana works end to end and sends **zero** external requests.
- [ ] Export/batching costs, deployment function usage, and cron/reporting resources stay within existing free usage.
- [ ] Missing/over-limit telemetry never interrupts a learner; no automatic upgrades, card collection, or paid plan fallback.
- [ ] No secret or private learner content appears in provider telemetry.
- [ ] Audit system and SRS correctness remain unchanged.
- [ ] Required unit/batch/full checks are run or explicitly marked pending/failed.
- [ ] `progress-tracker.md` and affected context files match what was actually implemented.

**If there is a choice between losing optional analytics and paying, always lose the optional analytics.**

## 16. Open implementation dependencies (not authorization to pay)

1. Inspect the real repository before deciding exactly which settings table can hold the consent fields, where to place its Settings UI, and how a stable pseudonymous analytics ID fits the existing user lifecycle.
2. Confirm the selected OpenTelemetry SDK and Next.js integration correctly export all three signals on the deployed Vercel runtime; OTel JS logging APIs have version-specific maturity and must be verified rather than assumed stable.
3. Validate an actual nonproduction Grafana Free OTLP token and synthetic-monitoring location; no account credentials or activation were provided in this spec-writing session.
4. Check whether Grafana Free query/API access supports an accurate automated daily availability rollup and whether the current Vercel/Neon accounts allow it at **zero additional cost**. Otherwise use the documented manual/partial reporting fallback; do not upgrade or fabricate monthly SLOs.
5. Review the current existence and configuration of Sentry before adding OTel provider initialization; Sentry rollout remains separately scoped.
6. Verify account status, pricing, and applicable privacy/legal requirements immediately before live enablement. A public beta URL and the existence of a Vercel deployment do not by themselves prove the hosting plan permits commercial operation.
7. Confirm that the owner's email contact address for alerts is configured. No alert should be called functional until a real controlled triggered/resolved test email is observed.

## 17. Reference documents

### Internal source-of-truth

- `project-overview.md` — language-learning workflow and privacy/availability principles.
- `architecture.md` — modular monolith, PostHog/Sentry boundary, existing audit log, performance budgets, SLOs, environment separation, health endpoints, graceful degradation.
- `code-standards.md` — analytics event naming, logging redaction, TypeScript/Zod, security boundaries, test strategy, environment settings.
- `ui-context.md` — learner/admin visual tokens, accessibility, Save/Cancel controls, React Admin integration.
- `ai-workflow-rules.md` — one verifiable unit at a time, migration and documentation rules, tiered verification, honest reporting.
- `progress-tracker.md` — Spec 24 logging groundwork, Spec 26 Audit/Logs changes, remaining provider and health-endpoint implementation gaps.

### Provider documents checked 2026-10-15

- PostHog pricing: https://posthog.com/pricing
- Grafana Cloud pricing: https://grafana.com/pricing/
- Grafana Free registration and service limits: https://grafana.com/get/
- Grafana Cloud OTLP ingestion: https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/
- Vercel Hobby limits: https://vercel.com/docs/plans/hobby
- Vercel noncommercial fair-use restriction: https://vercel.com/docs/limits/fair-use-guidelines
- Vercel Hobby cron restrictions: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- PostHog Next.js SDK: https://posthog.com/docs/libraries/next-js

---

**Implementation starting point:** **Unit 27.1 only** — establish free-plan configuration gates, typed optional provider switches, disabled/no-op behavior, safe environment setup instructions, and tests proving telemetry can be fully disabled without impacting the application. **Do not create accounts, transmit production data, configure live alerts, or modify production deployment as part of Unit 27.1 without explicit owner authorization.**
