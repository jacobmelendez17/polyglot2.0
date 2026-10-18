"use server";

import { z } from "zod";

import { captureAnalyticsIntent } from "@/domains/analytics/server";
import { requireUser } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";
import { withTrace } from "@/lib/logging/operation-tracer";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

// Strict, and a closed list of three: this is the whole of what the browser is
// allowed to tell the server about analytics. The session key is the session's
// own random id (a UUID); there is no field for a count, a level, a label, an
// answer or a person, so there is nothing a client could send that would end up
// in an event except that a session began.
const analyticsIntentSchema = z.discriminatedUnion("event", [
  z.strictObject({ event: z.literal("onboarding_started") }),
  z.strictObject({ event: z.literal("lesson_started"), sessionKey: z.uuid() }),
  z.strictObject({
    event: z.literal("review_session_started"),
    sessionKey: z.uuid(),
  }),
]);

/**
 * Spec 27 Unit 27.3 — the first-party endpoint for "a session started" reports
 * (spec 27 §4: browser-originated events go through an authenticated,
 * validated, rate-limited, consent-checked server endpoint — never a browser
 * SDK). A Server Action is exactly that: a POST to this origin, checked by the
 * framework's own cross-site protection, from a signed-in session.
 *
 * It answers `ok` for anyone it declines to record — no consent, analytics off,
 * a sandbox persona — because that is not an error and the page has nothing to
 * do about it. It refuses (and the page ignores the refusal) only what is
 * malformed, unauthenticated, or over the intent rate limit. Consent is read
 * from the database when the event is about to be sent, never from the request.
 */
export async function captureAnalyticsIntentAction(
  input: z.infer<typeof analyticsIntentSchema>,
): Promise<ActionResult<null>> {
  try {
    await withTrace(
      "analytics.intent",
      async () => {
        const intent = analyticsIntentSchema.parse(input);
        const user = await requireUser();
        await captureAnalyticsIntent({
          userId: user.id,
          languageId: user.activeLanguageId,
          intent,
        });
      },
      { level: "debug", newTrace: true },
    );
    return { ok: true, data: null };
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
      error: { code: "UNKNOWN", message: "Something went wrong." },
    };
  }
}
