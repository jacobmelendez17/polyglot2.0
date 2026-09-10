import { describe, expect, it } from "vitest";

import { ITEM_CASA_ID, ITEM_GATO_ID, LEARNER_ID, LEVEL_2_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { getLevelByLanguageAndNumber } from "@/domains/curriculum/curriculum-repository";
import { getAuditEvents } from "@/domains/admin/audit-repository";
import { getItemProgress, getUnlockedLevels, unlockLevel } from "@/domains/progress/repository";

import { resetOwnAccountProgress } from "./account-reset-service";

/**
 * Covers `resetOwnAccountProgress` — the "Reset my account progress" admin
 * control, distinct from `domains/sandbox`'s `resetSandboxForOwner` (see
 * that suite for the sandbox-persona equivalent). This resets a *real*
 * account's own progress, so the critical thing to prove is the mirror
 * image of the sandbox suite's own "never touches a real learner" test:
 * this must never touch anyone *else's* progress, only the caller's own.
 */
describe("resetOwnAccountProgress", () => {
  it("clears the caller's own progress and re-establishes only the Level 1 starting state", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      // Resetting an account restores the *application's* Level 1 unlock —
      // where a real learner starts — not the fixture's own level.
      const applicationLevel1 = await getLevelByLanguageAndNumber(tx, languageId, 1, { includeUnpublished: true });
      await unlockLevel(tx, { userId: LEARNER_ID, levelId: LEVEL_2_ID, now: new Date() });

      await resetOwnAccountProgress(tx, { userId: LEARNER_ID, languageId, idempotencyKey: crypto.randomUUID() });

      const unlocked = await getUnlockedLevels(tx, LEARNER_ID, languageId);
      expect(unlocked.map((l) => l.levelId)).toEqual([applicationLevel1!.id]);
      expect(await getItemProgress(tx, LEARNER_ID, ITEM_GATO_ID)).toBeNull();
      expect(await getItemProgress(tx, LEARNER_ID, ITEM_CASA_ID)).toBeNull();

      const audit = await getAuditEvents(tx, { action: "ACCOUNT_PROGRESS_RESET", resourceId: LEARNER_ID, limit: 10 });
      expect(audit.items).toHaveLength(1);
    });
  });

  it("is idempotent — retrying with the same key does not record a second audit event", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();

      await resetOwnAccountProgress(tx, { userId: LEARNER_ID, languageId, idempotencyKey });
      await resetOwnAccountProgress(tx, { userId: LEARNER_ID, languageId, idempotencyKey });

      const audit = await getAuditEvents(tx, { action: "ACCOUNT_PROGRESS_RESET", resourceId: LEARNER_ID, limit: 10 });
      expect(audit.items).toHaveLength(1);
    });
  });
});
