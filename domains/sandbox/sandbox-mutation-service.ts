import { db } from "@/db/client";
import { getRateLimiter } from "@/providers/rate-limit";
import { AdminError } from "@/lib/errors/admin-errors";

import * as sandbox from "./sandbox-service";
import type {
  MakeSandboxReviewsDueServiceInput,
  ResetSandboxServiceInput,
  SetSandboxItemStageServiceInput,
  SimulateLevelServiceInput,
} from "./sandbox-service";

/** Binds the real app database and rate limiter to `sandbox-service.ts`'s injectable functions — same pattern as `domains/admin/admin-mutation-service.ts`. */

async function checkRateLimit(userId: string): Promise<void> {
  const decision = await getRateLimiter().check({ policy: "sandbox-mutation", subject: userId });
  if (!decision.allowed) {
    throw new AdminError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
}

export async function getSandboxSnapshotForOwner(ownerUserId: string, languageId: string) {
  return sandbox.getSandboxSnapshotForOwner(db, ownerUserId, languageId);
}

export async function simulateLevelForSandbox(input: SimulateLevelServiceInput) {
  await checkRateLimit(input.actorUserId);
  return sandbox.simulateLevelForSandbox(db, input);
}

export async function setSandboxItemStage(input: SetSandboxItemStageServiceInput) {
  await checkRateLimit(input.actorUserId);
  return sandbox.setSandboxItemStage(db, input);
}

export async function makeSandboxReviewsDue(input: MakeSandboxReviewsDueServiceInput) {
  await checkRateLimit(input.actorUserId);
  return sandbox.makeSandboxReviewsDue(db, input);
}

export async function resetSandboxForOwner(input: ResetSandboxServiceInput) {
  await checkRateLimit(input.actorUserId);
  return sandbox.resetSandboxForOwner(db, input);
}
