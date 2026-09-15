import type { DbClient } from "@/db/client";
import { getLanguageByCode, getLevelByLanguageAndNumber } from "@/domains/curriculum/curriculum-repository";
import { getDefaultLanguageCode } from "@/domains/users";
import { withIdempotency } from "@/domains/idempotency";
import { unlockLevel } from "@/domains/progress/repository";
import { AppError } from "@/lib/errors/app-error";

import { deleteAllLearnerApplicationData, resetUserIdentityFields } from "./account-reset-repository";

export type ResetEntireAccountInput = { userId: string; idempotencyKey: string; now?: Date };

/**
 * Spec 20 Danger Zone — Reset Entire Account. "Intentionally broader than
 * the existing development-only reset progress operation"
 * (`domains/admin/account-reset-service.ts`'s `resetOwnAccountProgress`,
 * which only ever clears `user_item_progress`/`user_level_progress`) —
 * this clears every table `account-reset-repository.ts` names, resets the
 * account's identity-derived/onboarding fields, and re-establishes exactly
 * the state a freshly provisioned account has (`domains/users/
 * user-repository.ts`'s `provisionUser`: default language, `UTC`
 * timezone, Level 1 unlocked) — composed the same way that function
 * itself is, so "fresh account" means the literal same starting point, not
 * an approximation of it.
 *
 * One transaction for the whole operation (spec: "transactions where
 * multiple records are affected") — every table clears or none do.
 * Idempotency-wrapped like every other Danger Zone operation; a retry with
 * the same key replays the original result rather than re-running a
 * (harmless but wasteful) second wipe of an already-empty account.
 */
export async function resetEntireAccount(db: DbClient, input: ResetEntireAccountInput): Promise<{ resetAt: string }> {
  const now = input.now ?? new Date();

  return withIdempotency(
    db,
    { userId: input.userId, operation: "danger-zone.reset-entire-account", key: input.idempotencyKey, payload: {} },
    async (tx) => {
      const language = await getLanguageByCode(tx, getDefaultLanguageCode());
      if (!language) throw new AppError("PROVISIONING_FAILED", "The default language is not configured.");

      const level1 = await getLevelByLanguageAndNumber(tx, language.id, 1, { includeUnpublished: true });
      if (!level1) throw new AppError("PROVISIONING_FAILED", "Level 1 of the default language is not configured.");

      await deleteAllLearnerApplicationData(tx, input.userId);
      await resetUserIdentityFields(tx, { userId: input.userId, defaultLanguageId: language.id, now });
      await unlockLevel(tx, { userId: input.userId, levelId: level1.id, now });

      return { resetAt: now.toISOString() };
    },
  );
}
