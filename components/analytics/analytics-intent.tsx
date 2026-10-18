"use client";

import { useEffect, useRef } from "react";

import type { AnalyticsIntent as AnalyticsIntentInput } from "@/domains/analytics";

export type ReportAnalyticsIntent = (
  intent: AnalyticsIntentInput,
) => Promise<unknown>;

type AnalyticsIntentProps = {
  /** `captureAnalyticsIntentAction`, handed in by the server page — so this component, and every component that renders it, imports no server code. */
  report: ReportAnalyticsIntent;
  intent: AnalyticsIntentInput;
};

/**
 * Spec 27 Unit 27.3 — tells the server, once, that a session began (a lesson, a
 * review session, onboarding). It renders nothing.
 *
 * The page renders it only for a learner whose analytics are on *and* who
 * currently consents, so for everyone else it does not exist and nothing is
 * called. The endpoint checks consent again regardless: this is a courtesy that
 * saves a pointless request, not the control.
 *
 * Fire-and-forget by design: the report is allowed to fail in every way (offline,
 * rate limited, server error) and nothing about the session depends on it — a
 * rejection, or a throw before a promise even exists, is swallowed here so it can
 * never reach an error boundary and interrupt a lesson.
 */
export function AnalyticsIntent({ report, intent }: AnalyticsIntentProps) {
  const reported = useRef(false);

  useEffect(() => {
    // Once per mount, however React re-runs effects (Strict Mode runs this twice
    // in development; the ref survives the rerun).
    if (reported.current) return;
    reported.current = true;
    try {
      void Promise.resolve(report(intent)).catch(() => undefined);
    } catch {
      // Reporting is best-effort; see above.
    }
    // The intent describes this mount's session and does not change for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
