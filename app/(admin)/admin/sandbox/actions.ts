"use server";

import { z } from "zod";

import { canAccessAdminArea } from "@/domains/admin";
import {
  makeSandboxReviewsDue,
  resetSandboxForOwner,
  setSandboxItemStage,
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
