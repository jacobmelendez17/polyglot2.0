# Telemetry setup runbook (Spec 27)

How to turn on Polyglot's product analytics (PostHog) and observability (Grafana Cloud) **without spending money**. Read this before creating an account or setting any variable. The spec is `context/feature-specs/27-analytics-observability.md`; the code that reads these settings is `lib/telemetry-config.ts`.

## 1. The one rule

**$0 a month, always.** No paid plan, no card, no trial that converts, no upgrade, no add-on. If a step below would need any of those, stop and leave that part of telemetry switched off. Losing optional analytics costs nothing; a surprise bill does.

## 2. What exists today

Units **27.1, 27.2, 27.3, 27.5, 27.6 and 27.7** are built: the settings contract and safety gates, the learner's consent switch, the PostHog sender with the approved learning events, the Grafana senders (metrics, sampled traces, sanitized warnings) and the two health endpoints. **Nothing is sent until you turn a provider on** (sections 4, 5, 11 and 12): PostHog only for a learner who has accepted in Settings → Privacy, and Grafana only what section 12 lists.

| Unit | Adds                                                | Until it ships                                  |
| ---- | --------------------------------------------------- | ----------------------------------------------- |
| 27.1 | Settings, gates, no-op adapters, this runbook       | Done — nothing is sent                          |
| 27.2 | Account-wide analytics consent in Settings          | Done — a learner can opt in; nothing is sent    |
| 27.3 | PostHog adapter and the approved learning events    | Done — sends only if you enable it (section 11) |
| 27.5 | OpenTelemetry metrics and sampled traces to Grafana | Done — sends only if you enable it (section 12) |
| 27.6 | Sanitized log export to Grafana                     | Done — sends only if you enable it (section 12) |
| 27.7 | `/api/health` and `/api/health/ready`               | Done — the endpoints exist; the check is yours  |

Accounts, dashboards, the uptime check and alert emails (27.4, 27.8, and the external check for 27.7 — section 12) are things only you can create. Nothing in the repository creates an account or contacts a provider.

## 3. What the free plans give (verify when you sign up)

Limits are the ones Spec 27 recorded on 2026-10-15, re-read against each provider's own pages on 2026-10-17. Providers change them; confirm on the page you are signing up on.

| Provider                      | Free allowance Spec 27 relies on                                                                                                         | Condition                                                                 | Source                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| PostHog Cloud                 | 1,000,000 product-analytics events a month; events kept 1 year                                                                           | Free plan, no card. Events over the allowance are **dropped, not billed** | [posthog.com/pricing](https://posthog.com/pricing) (the pricing page truncated when re-read — confirm the figures on the signup page) |
| Grafana Cloud Free            | 10k active metric series; 50 GB logs and 50 GB traces a month; 14-day retention; 3 active users                                          | Free plan, no card. Do **not** start a Pro trial                          | [grafana.com/pricing](https://grafana.com/pricing/)                                                                                   |
| Grafana Synthetic Monitoring  | 100k API-test and 10k browser-test executions a month (the page does not say whether the two share a pool)                               | One 5-minute HTTP check ≈ 8,928 runs a month per probe location           | [grafana.com/pricing](https://grafana.com/pricing/)                                                                                   |
| Vercel Hobby                  | 1,000,000 function invocations, 4 Active CPU-hours, 100 GB data transfer a month; 1 hour of runtime logs; 100 cron jobs, once a day each | **Non-commercial, personal use only.** Hobby has no Drains                | [Hobby plan](https://vercel.com/docs/plans/hobby), [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)                 |
| Neon, Clerk, Upstash, AWS, R2 | Whatever your accounts already have                                                                                                      | Spec 27 adds no new resource and no new charge                            | —                                                                                                                                     |

Two consequences worth knowing now:

- **Going over a Hobby limit pauses the feature for about 30 days; it does not bill you.** "Free" is therefore not "safe" — a paused app is an outage. Telemetry has to stay small: the Grafana export runs inside your Vercel functions, so whatever CPU time and duration it adds counts against the same Hobby allowances as the app.
- **Hobby is for non-commercial use.** Polyglot's planned premium tier (Level 4 and up, Stripe) is commercial. Spec 27 does not authorize paying for Vercel Pro to fix that, and nothing here works around it. If Polyglot becomes commercial, stop and decide that separately (see section 9).

## 4. The gate before anything goes live

Spec 27 §15 forbids enabling a provider until its row below is **PASS**. Fill the status in as you check; the two `*_FREE_PLAN_CONFIRMED` switches in section 5 are you recording that you did. `BLOCKED` or `NOT VERIFIED` means leave that provider off.

| #   | Check                                                                                                             | Status                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | PostHog organization is on the **Free** plan, with **no billing card** and pay-as-you-go not enrolled             | NOT VERIFIED                                                                                                                                                                                                                         |
| 2   | Grafana Cloud stack is on the **Free** plan, with **no billing card**, and nothing depends on a Pro/trial feature | NOT VERIFIED                                                                                                                                                                                                                         |
| 3   | No Vercel Drain, Observability Plus, Pro, or other paid hosting feature has been added                            | NOT VERIFIED                                                                                                                                                                                                                         |
| 4   | Vercel Hobby eligibility reviewed (non-commercial) — any mismatch escalated, not paid around                      | NOT VERIFIED                                                                                                                                                                                                                         |
| 5   | No new paid Neon, AWS, Clerk, monitoring, domain, SMTP or storage resource                                        | NOT VERIFIED                                                                                                                                                                                                                         |
| 6   | Provider usage pages checked and recorded; every signal is below its free allowance                               | NOT VERIFIED                                                                                                                                                                                                                         |
| 7   | Switching a provider off sends zero outbound requests                                                             | PASS for the code — tests for every sender, and a production server run with every switch off sent nothing to a local receiver (2026-10-18). Re-check after any change under `providers/` or to `instrumentation.ts`                 |
| 8   | Telemetry cannot interrupt a learner, and nothing upgrades an account or collects a card on its own               | PASS for the code — a failing sender is counted and swallowed, delivery follows the response, and nothing in the repository creates an account. NOT VERIFIED on Vercel until you have watched a real deployment (section 12, step 6) |
| 9   | A privacy notice and any legal review required for your audience are done **before live capture**                 | NOT VERIFIED                                                                                                                                                                                                                         |

Do not enroll in a time-limited paid trial to reach a free feature. If signup starts a trial automatically, make sure the account will land on Free with no card, and treat anything that only works during the trial as unavailable.

## 5. The settings

All optional, all **server-only** (none is `NEXT_PUBLIC_`, so none can reach a browser), all **off by default**. Parsed by `lib/telemetry-config.ts`. The same list, with the same placeholders, is in `.env.example`.

| Variable                         | Default | What it is and what is checked                                                                                                                                      |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTHOG_ENABLED`                | `false` | Switch for product analytics. Only `true` turns it on; `false`, unset and blank are off; anything else (`yes`, `1`) is reported and stays off                       |
| `POSTHOG_FREE_PLAN_CONFIRMED`    | `false` | Set `true` only after checks 1 and 3–5 above. Required before PostHog can run                                                                                       |
| `POSTHOG_PROJECT_TOKEN`          | —       | The PostHog **project token**, starting `phc_`. A personal API key (`phx_`) or secure key (`phs_`) is private and is refused                                        |
| `POSTHOG_HOST`                   | —       | Your region's ingestion host: `https://us.i.posthog.com` or `https://eu.i.posthog.com`. Nothing else is accepted (no path, port or query)                           |
| `TELEMETRY_METRICS_ENABLED`      | `false` | Switch for OpenTelemetry metrics to Grafana                                                                                                                         |
| `TELEMETRY_TRACES_ENABLED`       | `false` | Switch for sampled traces to Grafana                                                                                                                                |
| `TELEMETRY_LOGS_ENABLED`         | `false` | Switch for sanitized logs to Grafana                                                                                                                                |
| `GRAFANA_FREE_PLAN_CONFIRMED`    | `false` | Set `true` only after checks 2–5 above. Required before any Grafana signal can run                                                                                  |
| `GRAFANA_OTLP_ENDPOINT`          | —       | The base OTLP URL from your stack's OpenTelemetry tile: `https://otlp-gateway-<region>.grafana.net/otlp`. https, `*.grafana.net`, path `/otlp`, no `/v1/...` suffix |
| `GRAFANA_OTLP_INSTANCE_ID`       | —       | The numeric instance id from the same tile (the Basic-auth user name)                                                                                               |
| `GRAFANA_OTLP_TOKEN`             | —       | A Cloud Access Policy token starting `glc_`. A service-account token (`glsa_`) is refused                                                                           |
| `TELEMETRY_TRACE_SAMPLE_RATIO`   | `0.05`  | Fraction of ordinary requests traced, `0` to `1`. `0` turns tracing to nothing. Critical-operation metrics are never sampled                                        |
| `TELEMETRY_ALLOW_NON_PRODUCTION` | `false` | Development and preview send nothing unless this is `true` as well                                                                                                  |

**Where to set them.** Vercel → the project → Settings → Environment Variables, and tick **Production only**. Leave Preview and Development empty. Vercel applies a changed variable only to the _next_ deployment, so redeploy after changing one. Do not put production credentials in `.env.local` or in Preview (`architecture.md` invariant 40).

## 6. What the switches do

Every provider (and each Grafana signal) is always in one of three states:

| State      | Meaning                                                                                            | Outbound requests |
| ---------- | -------------------------------------------------------------------------------------------------- | ----------------- |
| `disabled` | Its switch is off. Its other settings are not even read, so leftovers in them cannot cause trouble | none              |
| `blocked`  | Its switch is on but it cannot run safely. It behaves exactly like `disabled`                      | none              |
| `enabled`  | Switch on, every setting valid, plan confirmed, production (or non-production explicitly allowed)  | only to its host  |

A `blocked` provider writes one `telemetry.config.blocked` warning per server instance, naming the **variable** and the kind of problem — never the value, because a secret pasted into the wrong variable is the commonest leak:

| Code                         | Means                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `missing_setting`            | A setting the provider needs is unset or blank                                      |
| `invalid_setting`            | Set, but malformed, the wrong kind of credential, or pointing somewhere not allowed |
| `plan_not_confirmed`         | The matching `*_FREE_PLAN_CONFIRMED` is not `true`                                  |
| `non_production_not_allowed` | `APP_ENV` is not production and `TELEMETRY_ALLOW_NON_PRODUCTION` is not `true`      |

A misconfigured telemetry setting **never stops the application starting** — that is deliberate, and the one place configuration does not fail fast. (A missing `DATABASE_URL` still does.) A blocked analytics provider is reported the first time a request would have used it, and a blocked Grafana signal when the server instance starts; neither is repeated until the instance restarts.

## 7. Turning telemetry off

Set the switch to `false` (or delete the variable) and redeploy. That alone sends nothing — no code change. Use it to:

- stop everything: `POSTHOG_ENABLED`, `TELEMETRY_METRICS_ENABLED`, `TELEMETRY_TRACES_ENABLED`, `TELEMETRY_LOGS_ENABLED` all `false`;
- shed load in a hurry, in this order: `TELEMETRY_LOGS_ENABLED`, then `TELEMETRY_TRACES_ENABLED` (or lower `TELEMETRY_TRACE_SAMPLE_RATIO`), then metrics, then PostHog.

If a provider's quota is reached, the provider drops the data and the app carries on; the account stays Free. Turning the signal off before you get there is the tidy way.

## 8. Watching the quotas

Spec 27 §3.3 asks you to look before you hit a limit — Polyglot cannot count for you, because usage is spread across many short-lived serverless instances and no in-app counter would be right.

- **Cadence:** check each provider's usage page weekly while beta traffic is small, and after any change to sampling or what is exported.
- **Warn at 50% and 75%** of any allowance (series, GB of logs, GB of traces, test executions, PostHog events, Vercel Active CPU and invocations). At 50%, note it; at 75%, switch the biggest optional signal off or lower the sampling ratio.
- **What to watch for Grafana:** active metric series (the one that grows with the number of live server instances — section 12), log and trace ingest, and Synthetic Monitoring executions.
- **Where:** PostHog's billing/usage page, Grafana Cloud's usage view for your stack, and Vercel's usage page for the project. Locations move — find them from your account when you sign in rather than from this document.

## 9. Open decisions that are yours

1. **Vercel Hobby and a commercial product.** See section 3. Nothing in Spec 27 authorizes a hosting upgrade; escalate it as its own decision when the premium tier is close.
2. **Privacy notice and consent wording** (check 9) before any live capture. The mechanics (explicit opt-in, server-side consent, no autocapture, no session replay) do not by themselves make Polyglot compliant anywhere.
3. **The email address that receives alerts** (Unit 27.8). No alert counts as working until you have received a real triggered-and-resolved test email.
4. **Account deletion and PostHog.** Withdrawing consent stops future events but does not erase delivered ones. The manual vendor deletion steps are in section 10; deleting a Polyglot account must never be blocked by a failed vendor request.

## 10. Learner consent, and what withdrawing and deleting do

Unit 27.2 added the learner's side. **Settings → Privacy** has one switch, "Share anonymous usage analytics". It is off for everyone until they turn it on, and it is held on the server, so it applies on every device.

- **Nothing is captured about a learner who has not accepted.** Never having chosen, declining, and being a sandbox persona all mean no. The check (`resolveAnalyticsCaptureIdentity`) reads the database each time it is asked — there is no copy to go stale. Even with every switch in section 5 on, a learner who has not accepted produces no event.
- **Withdrawing is immediate and permanent until they choose again.** It stops new events from that moment, on every device. It does **not** erase events already sent, and an event already on its way when they withdrew may still arrive. The Privacy page tells them both things.
- **Each learner's events are filed under a random ID** created when they first accept — not their name, email, Clerk id or Polyglot id. It stays the same if they withdraw and accept again.
- **Resetting an account withdraws the choice.** Danger Zone's "Reset Entire Account" returns the account to a fresh state, which includes this preference: the switch goes back to off and the ID is deleted, so a later acceptance starts a new one.
- **Deleting a Polyglot account deletes that ID** (the database removes it with the account), which ends the link between the person and anything already sent. Deleting an account never contacts PostHog and cannot be blocked by it.
- **If someone asks for their PostHog data to be erased**, do it _before_ their account is deleted, while the ID still exists: look up their ID in the `user_analytics_consent` table (`analytics_id`, by their account), then in PostHog find that person and delete them and their events (use the option that deletes the events too — check PostHog's current instructions). After the account is deleted the ID is gone, and what remains in PostHog can no longer be attributed to anyone. This is a manual step on the Free plan; nothing is automated yet, and it is listed in section 9 as a decision for you.
- **If you change what the page promises** (what may be recorded, where it goes, what withdrawing does), change `ANALYTICS_POLICY_VERSION` in `domains/analytics/analytics-consent.ts` in the same change. Everyone who accepted under the old wording then stops counting until they choose again; the Privacy page tells them why. Declines are never affected.
- **The `/privacy` page does not yet describe the optional analytics.** Update it before you turn live capture on (check 9 in section 4).

## 11. What PostHog receives, and turning it on

**What is sent.** Seven events, each a small record: the event name, the learner's random analytics ID, the language code (for example `es-MX`), the environment, a schema version, whether the server or the browser reported it, a random session ID, and a few bounded numbers or categories — how many items, accuracy as a percentage, the level, the content type (vocabulary or grammar), advanced or penalized, and the SRS stage as a band (`beginner`, `familiar`, `intermediate`, `master`, `fluent`), never the exact stage. The events are `onboarding_started`, `onboarding_completed`, `lesson_started`, `lesson_completed`, `review_session_started`, `review_item_completed` and `level_unlocked`.

**What is never sent.** A name, email, Clerk ID or Polyglot ID; an answer, a word, a note or a journal entry; a URL; the learner's IP address or location. No cookie is set and PostHog's JavaScript is never loaded: the browser never contacts PostHog. Everything goes from the server, after the learner's response has been sent.

**Five approved events are not sent because the product cannot produce them yet:** `review_session_completed` (the server cannot tell when a session ends), `practice_started` and `practice_completed` (there are no practice pages), and `dashboard_widget_added` and `dashboard_widget_removed` (nothing remembers a dashboard's widgets). They will start when those features exist.

**Settings to make in PostHog when you create the project** (labels move; find the equivalents):

- Turn on **Discard client IP data** for the project. The address PostHog sees is your server's, never the learner's, and the sender also asks PostHog not to look up a location — this is belt and braces.
- Leave autocapture, session recording, surveys, heatmaps and web analytics off. Nothing in Polyglot uses them.
- Use this project for production only. Non-production sends nothing unless you set `TELEMETRY_ALLOW_NON_PRODUCTION=true`; if you ever do, give it a separate PostHog project so test data cannot mix with real data.

**Volume.** `review_item_completed` is sent once for every item a consenting learner reviews and will be most of your events. One learner doing 100 reviews a day is about 3,000 events a month, so the 1,000,000 free events cover roughly 300 such learners, fewer once lessons and level unlocks are counted. Events over the allowance are dropped, not billed. There is **no sampling setting yet**: if the PostHog usage page shows 50% of the allowance, the levers are switching PostHog off (section 7) or changing the event catalog, which is a code change.

**Going live, in order:**

1. Section 4: checks 1, 3, 4, 5 and 9 are PASS, and `/privacy` describes the optional analytics.
2. In production only, set `POSTHOG_ENABLED=true`, `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST` and `POSTHOG_FREE_PLAN_CONFIRMED=true`; redeploy.
3. Turn the switch on for your own account in Settings → Privacy, then finish a lesson or a review.
4. The events should appear in PostHog's live events within a few minutes. If they do not, search the Vercel logs for `telemetry.config.blocked` (a setting is wrong — it names the variable), `analytics.posthog.send_failed` (the reason is `http_error`, `timeout` or `network_error`), and `analytics.event.dropped` (an event broke the catalog — it names the property, never the value).

Delivery is best effort and at most once: an event that cannot be delivered is lost, never retried, and never delays or fails a learner's lesson or review.

## 12. What Grafana receives, and turning it on

Unit 27.5 sends **metrics and sampled traces**, Unit 27.6 **warnings as logs**, each only if its switch is on (section 5). All three go straight from the application to Grafana's OTLP gateway; there is no collector, agent or drain.

**Metrics** — a closed list. Every one carries `environment`, plus only the labels shown. Route is a template cut to three segments (`/items/:param`, `/api/v1/admin`), never a URL.

| Metric                              | Other labels                      | Counts                                                                                                      |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `http_server_requests_total`        | `method`, `route`, `status_class` | Requests that reached a route (not the health probes, not a request the sign-in proxy answered)             |
| `http_server_request_duration_ms`   | `route`, `operation`              | The same requests' latency (`page`, `api` or `action`)                                                      |
| `review_submission_total`           | `outcome`, `error_category`       | Every review answer: `accepted`, `succeeded` (completed the item), `expected_rejected`, `unexpected_failed` |
| `review_submission_duration_ms`     | `outcome`                         | How long a review answer took                                                                               |
| `lesson_completion_total`           | `outcome`                         | Lesson completions: `succeeded`, `replayed`, `expected_rejected`, `unexpected_failed`                       |
| `database_operation_duration_ms`    | `operation`, `outcome`            | Idempotent transactions (`transaction`) and the readiness check (`readiness_check`)                         |
| `database_connection_failure_total` | `provider`                        | Failed readiness checks against Neon                                                                        |
| `telemetry_export_failure_total`    | `signal`                          | Exports that failed (`metrics`, `traces`, `logs`)                                                           |

A replay of work already committed is `replayed`, never a second `succeeded`. `practice_completion_total` is in the spec but not built: there are no practice completions to count. The bucket boundaries for the duration histograms are 10, 25, 50, 100, 200, 400, 800, 1600, 3200 and 6400 ms.

**Traces** — 5% of requests by default (`TELEMETRY_TRACE_SAMPLE_RATIO`; `0` exports none). A sampled request is one trace: the request itself (`GET /dashboard` — method and route template only) and, inside it, the application's own spans: `review.submission`, `review.commit`, `lesson.completion`, `account.deletion.finalize`. A span carries its outcome and error category and Spec 24's request id, and nothing else.

**Logs** — warnings and worse only, as `event.name` (a fixed dotted word such as `review.transaction.failed`) and a few validated attributes: the operation, a fixed `reason`, an error _code_ or class name, a status, a duration, and two ids. A log record shares the trace id of its request, so a failure's log line and its trace are found together. There is no field for a message, a stack, a user id, an email, SQL or anything a learner typed, so none of them can be sent.

**What is never sent:** URLs and query strings, user, session or item ids, emails, names, answers, notes, journal text, SQL, error messages, stack traces, headers, cookies and credentials. Next.js's own spans (renders, `fetch` calls) are never recorded. This is enforced three times — where spans are created, where they are built for export, and in the exporter — and tested with deliberately hostile data.

**What it costs**

- **Active series.** Grafana Free allows 10,000. Every server instance sends its own copy of each series (serverless instances would otherwise overwrite each other's counts), so the total is roughly _series per instance × instances alive at once_. A single instance with about 25 routes is a few hundred series; a busy day with ten instances is a few thousand. Check Grafana's usage page weekly (section 8), and expect it to rise with traffic, not with users.
- **Vercel Hobby CPU.** Metrics are sent at most every 30 seconds per instance, traces for about one request in twenty, logs only when something warns. That is a few milliseconds of CPU per sent batch, far below Hobby's 4 Active CPU-hours a month at beta traffic. The levers, in the order to pull them: `TELEMETRY_LOGS_ENABLED=false`, then `TELEMETRY_TRACE_SAMPLE_RATIO` lower (or `TELEMETRY_TRACES_ENABLED=false`), then metrics (section 7).
- **The learner.** Export happens after the response, inside the function's `waitUntil`; a slow or dead Grafana can hold a function open for at most a few seconds and never delays or fails a response. Failed exports are counted in `telemetry_export_failure_total` and not logged.

**Known limits, so they do not surprise you**

- **The last few seconds of metrics can be lost** if an instance is recycled before its next request; counts are cumulative, so later data is unaffected.
- **A request the sign-in proxy answers itself** (a redirect to sign-in) is not counted, and Next.js reports it as status 200 on no route, so it is left out rather than miscounted. Requests that reach a page, a route handler or a Server Action are counted with their real status.
- **Series per instance** means `increase()` and `rate()` over a window that spans an instance restart can undercount slightly. If Grafana's gateway turns out to accept _delta_ temporality, switching to it would remove both this and the per-instance multiplication; that is worth testing during step 6 and is a one-line change.
- **Metric names** are given above as the application records them. Grafana converts OpenTelemetry names to Prometheus names (a duration with unit `ms` may become `…_ms_milliseconds_bucket`); look them up in Explore → Metrics before writing a dashboard or alert (Unit 27.8).
- **Delivery on Vercel is unverified.** The code asks Vercel to keep the function alive until delivery using the interface Vercel documents for `waitUntil`. It was exercised against a stand-in and a local receiver, not on Vercel — step 6 below is how you find out.

**Setting up Grafana Cloud (yours — nothing in the repository creates an account)**

1. Create a Grafana Cloud account on the **Free** plan. Do not add a card or start a Pro trial (section 1). Create a stack in the region you prefer.
2. In the stack, find the OpenTelemetry (OTLP) connection details: the OTLP **endpoint** (it ends in `/otlp`), the numeric **instance ID**, and a button to create a token. Create an **Access Policy token** whose only scopes are `metrics:write`, `traces:write` and `logs:write` — nothing broader. It starts `glc_`.
3. Check sections 3 and 4 against your account (Free plan, no card, no Pro trial, no Vercel drain), then set in Vercel → Production only: `GRAFANA_FREE_PLAN_CONFIRMED=true`, `GRAFANA_OTLP_ENDPOINT`, `GRAFANA_OTLP_INSTANCE_ID`, `GRAFANA_OTLP_TOKEN`, and the switches you want (start with `TELEMETRY_METRICS_ENABLED=true` and `TELEMETRY_TRACES_ENABLED=true`; add `TELEMETRY_LOGS_ENABLED=true` when you are ready to see warnings). Leave `TELEMETRY_TRACE_SAMPLE_RATIO` at its default. Redeploy.
4. Open the app and use it for a minute, including a review and a lesson. In Grafana → Explore: pick the Prometheus/Mimir data source and look for `http_server_requests_total` (or the converted name); pick Tempo and search for service `polyglot`; pick Loki and look for `event.name`. Metrics appear within a minute or two; sampled traces are about one request in twenty.
5. Check the usage page for active series and ingest, and note them (section 8).
6. **Prove delivery on Vercel**: with only traces on at ratio `1`, make five requests and confirm five traces appear. If some are missing, the `waitUntil` assumption is wrong for your plan; tell whoever maintains this, and lower the expectations in section 8 until it is fixed. Then put the ratio back to `0.05`.
7. If a signal does not appear, search the Vercel logs for `telemetry.config.blocked` (a setting is wrong — it names the variable). A failing export is deliberately silent; look at `telemetry_export_failure_total` instead.

**The external uptime check (Unit 27.7)**

The application provides `GET /api/health` (liveness: `{"status":"ok"}`, always 200 while the app serves, no database or provider involved) and `GET /api/health/ready` (readiness: 200 `{"status":"ready"}`, or 503 `{"status":"unavailable"}` if a critical setting is missing or the database does not answer within 2.5 seconds; PostHog and Grafana are never part of it). Neither is cached, neither needs a login, and neither says anything about the build or the stack. A 503 from readiness leaves a `health.ready.failed` warning in the logs with the reason (`database_unreachable` or `configuration_missing`).

To create the check, in Grafana Cloud → Synthetic Monitoring → Checks → Add new check → **HTTP**:

- **URL**: `https://<your production domain>/api/health` (not the preview URL).
- **Frequency**: every **5 minutes**. **Probe locations**: **one**, the closest to you. About 8,928 runs a month, well inside the Free allowance of 100,000 (section 3). Do not add locations or a second check without re-reading that arithmetic.
- **Timeout**: 10 seconds is plenty. **Expected status**: 200. Leave everything else default.
- Optionally add `/api/health/ready` as a second check at the same frequency to watch the database; it doubles the usage and adds one `select 1` every five minutes.
- Alerting on a failed check is Unit 27.8. Until then, the check only records results; look at it, or at the Free allowance, from time to time.

Labels in Grafana move; find the equivalent if a name above has changed. The deployment smoke test (`scripts/smoke-test.mjs`) also calls both endpoints.

## 13. Changing this contract

A new switch, credential or limit means, in one change: `lib/telemetry-config.ts` (the parser and `TELEMETRY_SETTINGS`; a new on-switch also goes in `TELEMETRY_SWITCHES`), `.env.example`, the force-off lists in `vitest.config.mts` and `vitest.integration.config.mts`, and this runbook. Tests fail if any of those drifts apart.

Later units add their exports beside this file (Grafana dashboards and alert rules, PostHog dashboard definitions) so everything needed to rebuild the setup on a Free account is in version control.
