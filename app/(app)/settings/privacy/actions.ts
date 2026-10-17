"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AnalyticsConsentView } from "@/domains/analytics";
import { setAnalyticsConsent } from "@/domains/analytics/server";
import { requireUser } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";
import { withTrace } from "@/lib/logging/operation-tracer";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

// Strict: a field this action does not know is a refusal, not something quietly
// ignored — and there is deliberately no place in it to say who is asking, whose
// choice it is, or whether capture is allowed. The session decides the first
// two; the database decides the third.
const setAnalyticsConsentInputSchema = z.strictObject({
  status: z.enum(["accepted", "declined"]),
  // The revision the page last showed, or null when it showed no stored choice.
  // See `saveAcceptedConsent` for what it protects.
  expectedRevision: z.number().int().min(1).nullable(),
});

/**
 * Spec 27 Unit 27.2 — Settings → Privacy. Every Server Action gets a fresh
 * trace (spec 24). `withTrace` logs the unexpected failures with their stack; the
 * message handed back to the page is always safe to show.
 */
async function runPrivacyAction<T>(
  actionName: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return {
      ok: true,
      data: await withTrace(actionName, fn, { level: "info", newTrace: true }),
    };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "That request isn't valid.",
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Could not save setting. Please try again.",
      },
    };
  }
}

/**
 * Saves the signed-in learner's analytics choice. Authenticated and scoped to
 * the session's own account; rate limited and checked for staleness in the
 * service. Saving a choice never sends an analytics event — it only decides
 * whether later ones may be.
 */
export async function setAnalyticsConsentAction(
  input: z.infer<typeof setAnalyticsConsentInputSchema>,
): Promise<ActionResult<AnalyticsConsentView>> {
  return runPrivacyAction("analytics.consent.set", async () => {
    const parsed = setAnalyticsConsentInputSchema.parse(input);
    const user = await requireUser();

    const view = await setAnalyticsConsent({
      userId: user.id,
      status: parsed.status,
      expectedRevision: parsed.expectedRevision,
    });

    revalidatePath("/settings/privacy");
    return view;
  });
}
