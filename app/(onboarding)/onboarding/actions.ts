"use server";

import { revalidatePath } from "next/cache";

import { completeOnboarding } from "@/domains/users/server";
import { requireUser } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";
import { getRateLimiter } from "@/providers/rate-limit";

/**
 * Marks onboarding complete (spec 15). Takes no input at all: the user is
 * resolved server-side from the session, so there is nothing a client could
 * supply to complete onboarding for somebody else.
 *
 * Repeated clicks are safe by construction rather than by convention — the
 * underlying update is guarded on `onboarding_completed_at` still being
 * `NULL`, so a second call writes nothing and cannot move the recorded
 * timestamp. That is also why there is no idempotency key here: a
 * conditional update is already exactly-once.
 *
 * A sandbox persona is refused outright. Sandbox replay previews the whole
 * flow but must never persist, and that is enforced here rather than trusted
 * from a client-side flag.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export async function completeOnboardingAction(): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    if (user.isSandbox) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Sandbox previews don't change onboarding status.",
        },
      };
    }

    const decision = await getRateLimiter().check({
      policy: "onboarding-complete",
      subject: user.id,
    });
    if (!decision.allowed) {
      throw new AppError(
        "RATE_LIMITED",
        `Please slow down and try again in ${decision.retryAfterSeconds}s.`,
      );
    }

    await completeOnboarding(user.id);
    revalidatePath("/dashboard");
    return { ok: true, data: null };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    console.error("Unexpected onboarding action error", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}
