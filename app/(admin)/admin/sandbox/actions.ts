"use server";

import { z } from "zod";

import { cookies } from "next/headers";

import { canAccessAdminArea } from "@/domains/admin";
import { resetOwnAccountProgress } from "@/domains/admin/server";
import { db } from "@/db/client";
import {
  SANDBOX_SESSION_COOKIE,
  SANDBOX_SESSION_TTL_SECONDS,
  getOrCreateSandbox,
  makeSandboxReviewsDue,
  resetSandboxForOwner,
  setSandboxItemStage,
  setSandboxTimeOffsetForOwner,
  signSandboxGrant,
  simulateLevelForSandbox,
} from "@/domains/sandbox/server";
import { requireUser } from "@/domains/users/server";
import { AdminError } from "@/lib/errors/admin-errors";

/**
 * Thin Server Action entry points for the Developer Sandbox (spec 11
 * rewrite). Available to both `admin` and `developer` roles (spec's "A
 * developer without Admin rights may use the sandbox but cannot mutate
 * official curriculum") — every action re-checks `canAccessAdminArea`
 * itself, never trusting the page having already gated access. Mirrors
 * `app/(admin)/admin/curriculum/actions.ts`'s `ActionResult`/error-mapping
 * shape exactly.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function runSandboxAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    if (!canAccessAdminArea(user)) {
      return { ok: false, error: { code: "FORBIDDEN", message: "You don't have access to do that." } };
    }
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof AdminError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "CURRICULUM_VALIDATION_FAILED", message: "That request could not be understood." } };
    }
    console.error("Unexpected sandbox action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}

const SRS_STAGES = ["beginner_1", "beginner_2", "beginner_3", "beginner_4", "familiar_1", "familiar_2", "intermediate", "master", "fluent"] as const;

const simulateLevelActionSchema = z.object({
  languageId: z.string().min(1),
  levelId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export async function simulateLevelAction(input: z.infer<typeof simulateLevelActionSchema>): Promise<ActionResult<void>> {
  return runSandboxAction(async () => {
    const parsed = simulateLevelActionSchema.parse(input);
    const user = await requireUser();
    await simulateLevelForSandbox({ ...parsed, ownerUserId: user.id, actorUserId: user.id });
  });
}

const setSandboxItemStageActionSchema = z.object({
  languageId: z.string().min(1),
  learningItemId: z.string().min(1),
  srsStage: z.enum(SRS_STAGES),
  idempotencyKey: z.string().min(1),
});

export async function setSandboxItemStageAction(input: z.infer<typeof setSandboxItemStageActionSchema>): Promise<ActionResult<void>> {
  return runSandboxAction(async () => {
    const parsed = setSandboxItemStageActionSchema.parse(input);
    const user = await requireUser();
    await setSandboxItemStage({ ...parsed, ownerUserId: user.id, actorUserId: user.id });
  });
}

const makeSandboxReviewsDueActionSchema = z.object({
  languageId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export async function makeSandboxReviewsDueAction(input: z.infer<typeof makeSandboxReviewsDueActionSchema>): Promise<ActionResult<void>> {
  return runSandboxAction(async () => {
    const parsed = makeSandboxReviewsDueActionSchema.parse(input);
    const user = await requireUser();
    await makeSandboxReviewsDue({ ...parsed, ownerUserId: user.id, actorUserId: user.id });
  });
}

const resetSandboxActionSchema = z.object({
  languageId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export async function resetSandboxAction(input: z.infer<typeof resetSandboxActionSchema>): Promise<ActionResult<void>> {
  return runSandboxAction(async () => {
    const parsed = resetSandboxActionSchema.parse(input);
    const user = await requireUser();
    await resetSandboxForOwner({ ...parsed, ownerUserId: user.id, actorUserId: user.id });
  });
}

const resetOwnAccountProgressActionSchema = z.object({
  languageId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

/**
 * Resets the signed-in admin/developer's own **real** account progress —
 * distinct from `resetSandboxAction` above, which only ever touches an
 * isolated sandbox persona. For repeatedly testing the live lesson/review
 * flow on a real account without needing a fresh signup each time.
 */
export async function resetOwnAccountProgressAction(
  input: z.infer<typeof resetOwnAccountProgressActionSchema>,
): Promise<ActionResult<void>> {
  return runSandboxAction(async () => {
    const parsed = resetOwnAccountProgressActionSchema.parse(input);
    const user = await requireUser();
    await resetOwnAccountProgress({ ...parsed, userId: user.id });
  });
}

const setSandboxTimeOffsetActionSchema = z.object({
  languageId: z.string().min(1),
  /**
   * Absolute offset from real server time, in seconds. Bounded to a decade in
   * either direction — enough to simulate any realistic SRS horizon, small
   * enough that a bad value cannot push scheduling into a range where date
   * arithmetic stops being meaningful.
   */
  offsetSeconds: z.number().int().min(-10 * 365 * 24 * 60 * 60).max(10 * 365 * 24 * 60 * 60),
  idempotencyKey: z.string().min(1),
});

export async function setSandboxTimeOffsetAction(
  input: z.infer<typeof setSandboxTimeOffsetActionSchema>,
): Promise<ActionResult<void>> {
  return runSandboxAction(async () => {
    const parsed = setSandboxTimeOffsetActionSchema.parse(input);
    const user = await requireUser();
    await setSandboxTimeOffsetForOwner({ ...parsed, ownerUserId: user.id, actorUserId: user.id });
  });
}

const openSandboxActionSchema = z.object({ languageId: z.string().min(1) });

/**
 * Spec 11's "Open Sandbox" — issues a short-lived, signed grant so the admin's
 * next learner-page request resolves as their own sandbox persona.
 *
 * The cookie is `httpOnly` and `sameSite: "strict"`: it is never readable by
 * page scripts, and it is never sent on a cross-site navigation, so a link
 * from elsewhere cannot silently put an admin into a sandbox session. It is
 * `secure` outside development, where localhost is served over plain HTTP.
 *
 * The grant only *requests* impersonation — `resolveCurrentUser` re-proves
 * ownership against the database on every request before honouring it.
 */
export async function openSandboxAction(input: z.infer<typeof openSandboxActionSchema>): Promise<ActionResult<void>> {
  return runSandboxAction(async () => {
    const { languageId } = openSandboxActionSchema.parse(input);
    const user = await requireUser();
    const account = await getOrCreateSandbox(db, user.id, languageId);
    const token = await signSandboxGrant({ adminUserId: user.id, sandboxUserId: account.sandboxUserId });

    const cookieStore = await cookies();
    cookieStore.set(SANDBOX_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SANDBOX_SESSION_TTL_SECONDS,
    });
  });
}

/** Ends a sandbox viewing session. Deliberately requires no authorization beyond being signed in — leaving an impersonation session must never be blocked. */
export async function closeSandboxAction(): Promise<ActionResult<void>> {
  const cookieStore = await cookies();
  cookieStore.delete(SANDBOX_SESSION_COOKIE);
  return { ok: true, data: undefined };
}
