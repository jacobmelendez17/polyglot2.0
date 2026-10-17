# Telemetry setup runbook (Spec 27)

How to turn on Polyglot's product analytics (PostHog) and observability (Grafana Cloud) **without spending money**. Read this before creating an account or setting any variable. The spec is `context/feature-specs/27-analytics-observability.md`; the code that reads these settings is `lib/telemetry-config.ts`.

## 1. The one rule

**$0 a month, always.** No paid plan, no card, no trial that converts, no upgrade, no add-on. If a step below would need any of those, stop and leave that part of telemetry switched off. Losing optional analytics costs nothing; a surprise bill does.

## 2. What exists today

Only **Unit 27.1** is built: the settings contract, the switches, the safety gates, and disabled adapters. **Nothing sends anything yet, and setting these variables changes nothing** until the units that add the senders ship.

| Unit | Adds                                                | Until it ships                                 |
| ---- | --------------------------------------------------- | ---------------------------------------------- |
| 27.1 | Settings, gates, no-op adapters, this runbook       | Done — nothing is sent                         |
| 27.2 | Account-wide analytics consent in Settings          | No learner can opt in                          |
| 27.3 | PostHog adapter and the approved learning events    | `POSTHOG_*` has no effect                      |
| 27.5 | OpenTelemetry metrics and sampled traces to Grafana | `TELEMETRY_METRICS_ENABLED` / `_TRACES_` no-op |
| 27.6 | Sanitized log export to Grafana                     | `TELEMETRY_LOGS_ENABLED` has no effect         |
| 27.7 | `/api/health` and `/api/health/ready`               | No uptime check is possible                    |

Accounts, dashboards, the uptime check and alert emails (27.4, 27.7, 27.8) are things only you can create. Nothing in the repository creates an account or contacts a provider.

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

| #   | Check                                                                                                             | Status                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | PostHog organization is on the **Free** plan, with **no billing card** and pay-as-you-go not enrolled             | NOT VERIFIED                                                                                                                 |
| 2   | Grafana Cloud stack is on the **Free** plan, with **no billing card**, and nothing depends on a Pro/trial feature | NOT VERIFIED                                                                                                                 |
| 3   | No Vercel Drain, Observability Plus, Pro, or other paid hosting feature has been added                            | NOT VERIFIED                                                                                                                 |
| 4   | Vercel Hobby eligibility reviewed (non-commercial) — any mismatch escalated, not paid around                      | NOT VERIFIED                                                                                                                 |
| 5   | No new paid Neon, AWS, Clerk, monitoring, domain, SMTP or storage resource                                        | NOT VERIFIED                                                                                                                 |
| 6   | Provider usage pages checked and recorded; every signal is below its free allowance                               | NOT VERIFIED                                                                                                                 |
| 7   | Switching a provider off sends zero outbound requests                                                             | NOT VERIFIED — holds for the 27.1 no-op (`providers/analytics` tests); re-prove when a real sender exists (27.3, 27.5, 27.6) |
| 8   | Telemetry cannot interrupt a learner, and nothing upgrades an account or collects a card on its own               | NOT VERIFIED — nothing sends yet; re-prove with the senders                                                                  |
| 9   | A privacy notice and any legal review required for your audience are done **before live capture**                 | NOT VERIFIED                                                                                                                 |

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

A misconfigured telemetry setting **never stops the application starting** — that is deliberate, and the one place configuration does not fail fast. (A missing `DATABASE_URL` still does.) No warning appears today, because nothing asks for the analytics provider until Unit 27.3.

## 7. Turning telemetry off

Set the switch to `false` (or delete the variable) and redeploy. That alone sends nothing — no code change. Use it to:

- stop everything: `POSTHOG_ENABLED`, `TELEMETRY_METRICS_ENABLED`, `TELEMETRY_TRACES_ENABLED`, `TELEMETRY_LOGS_ENABLED` all `false`;
- shed load in a hurry, in this order: `TELEMETRY_LOGS_ENABLED`, then `TELEMETRY_TRACES_ENABLED` (or lower `TELEMETRY_TRACE_SAMPLE_RATIO`), then metrics, then PostHog.

If a provider's quota is reached, the provider drops the data and the app carries on; the account stays Free. Turning the signal off before you get there is the tidy way.

## 8. Watching the quotas

Spec 27 §3.3 asks you to look before you hit a limit — Polyglot cannot count for you, because usage is spread across many short-lived serverless instances and no in-app counter would be right.

- **Cadence:** check each provider's usage page weekly while beta traffic is small, and after any change to sampling or what is exported.
- **Warn at 50% and 75%** of any allowance (series, GB of logs, GB of traces, test executions, PostHog events, Vercel Active CPU and invocations). At 50%, note it; at 75%, switch the biggest optional signal off or lower the sampling ratio.
- **Where:** PostHog's billing/usage page, Grafana Cloud's usage view for your stack, and Vercel's usage page for the project. Locations move — find them from your account when you sign in rather than from this document.

## 9. Open decisions that are yours

1. **Vercel Hobby and a commercial product.** See section 3. Nothing in Spec 27 authorizes a hosting upgrade; escalate it as its own decision when the premium tier is close.
2. **Privacy notice and consent wording** (check 9) before any live capture. The mechanics (explicit opt-in, server-side consent, no autocapture, no session replay) do not by themselves make Polyglot compliant anywhere.
3. **The email address that receives alerts** (Unit 27.8). No alert counts as working until you have received a real triggered-and-resolved test email.
4. **Account deletion and PostHog.** Withdrawing consent stops future events but does not erase delivered ones. The vendor deletion workflow gets written in Units 27.2–27.3; deleting a Polyglot account must never be blocked by a failed vendor request.

## 10. Changing this contract

A new switch, credential or limit means, in one change: `lib/telemetry-config.ts` (the parser and `TELEMETRY_SETTINGS`; a new on-switch also goes in `TELEMETRY_SWITCHES`), `.env.example`, the force-off lists in `vitest.config.mts` and `vitest.integration.config.mts`, and this runbook. Tests fail if any of those drifts apart.

Later units add their exports beside this file (Grafana dashboards and alert rules, PostHog dashboard definitions) so everything needed to rebuild the setup on a Free account is in version control.
