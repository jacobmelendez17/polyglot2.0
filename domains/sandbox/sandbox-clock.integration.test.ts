import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { languages, levels, users } from "@/db/schema";
import type { TestTx } from "@/db/test/with-test-transaction";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import {
  getSandboxTimeOffset,
  resolveUserNow,
  setSandboxTimeOffset,
} from "@/domains/users/user-clock";

import {
  getOrCreateSandbox,
  resetSandboxForOwner,
  setSandboxTimeOffsetForOwner,
} from "./sandbox-service";

/**
 * Spec 11's "Time simulation uses a sandbox-specific clock abstraction", and
 * its isolation rule: sandbox actions must never modify server/global time or
 * any other user.
 *
 * Each test builds its own language, level, admin, and sandbox, for the
 * shared-Neon-branch reason documented in `domains/lexicon`'s integration
 * tests.
 */

let counter = 0;

async function seedSandboxFixture(tx: TestTx) {
  counter += 1;
  const suffix = `${counter}${Math.floor(Math.random() * 100000)}`;
  const [language] = await tx
    .insert(languages)
    .values({
      code: `es-S${suffix}`,
      slug: `spanish-sandbox-${suffix}`,
      name: `Spanish (sandbox ${suffix})`,
    })
    .returning();
  await tx.insert(levels).values({
    languageId: language.id,
    levelNumber: 1,
    name: "Level 1",
    status: "published",
  });
  const [admin] = await tx
    .insert(users)
    .values({
      clerkUserId: `sandbox-admin-${suffix}`,
      role: "admin",
      activeLanguageId: language.id,
    })
    .returning();
  const [otherLearner] = await tx
    .insert(users)
    .values({
      clerkUserId: `sandbox-bystander-${suffix}`,
      role: "user",
      activeLanguageId: language.id,
    })
    .returning();
  return {
    languageId: language.id,
    adminUserId: admin.id,
    otherLearnerId: otherLearner.id,
  };
}

const REAL_NOW = new Date("2026-03-01T12:00:00Z");
const DAY = 24 * 60 * 60;

describe("sandbox clock", () => {
  it("shifts only the sandbox persona's perceived time, never the admin's or a bystander's", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, adminUserId, otherLearnerId } =
        await seedSandboxFixture(tx);
      const account = await getOrCreateSandbox(tx, adminUserId, languageId);

      await setSandboxTimeOffsetForOwner(tx, {
        ownerUserId: adminUserId,
        languageId,
        actorUserId: adminUserId,
        offsetSeconds: 7 * DAY,
        idempotencyKey: crypto.randomUUID(),
      });

      const sandboxNow = await resolveUserNow(
        tx,
        account.sandboxUserId,
        REAL_NOW,
      );
      expect(sandboxNow.getTime()).toBe(REAL_NOW.getTime() + 7 * DAY * 1000);

      // Spec 11's isolation rule, asserted rather than assumed.
      expect((await resolveUserNow(tx, adminUserId, REAL_NOW)).getTime()).toBe(
        REAL_NOW.getTime(),
      );
      expect(
        (await resolveUserNow(tx, otherLearnerId, REAL_NOW)).getTime(),
      ).toBe(REAL_NOW.getTime());
    });
  });

  it("treats the offset as absolute, so a replayed request cannot compound it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, adminUserId } = await seedSandboxFixture(tx);
      const account = await getOrCreateSandbox(tx, adminUserId, languageId);
      const input = {
        ownerUserId: adminUserId,
        languageId,
        actorUserId: adminUserId,
        offsetSeconds: 7 * DAY,
        idempotencyKey: crypto.randomUUID(),
      };

      await setSandboxTimeOffsetForOwner(tx, input);
      await setSandboxTimeOffsetForOwner(tx, input);

      expect(await getSandboxTimeOffset(tx, account.sandboxUserId)).toBe(
        7 * DAY,
      );
    });
  });

  it("returns the persona to the present when the sandbox is reset", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, adminUserId } = await seedSandboxFixture(tx);
      const account = await getOrCreateSandbox(tx, adminUserId, languageId);
      await setSandboxTimeOffsetForOwner(tx, {
        ownerUserId: adminUserId,
        languageId,
        actorUserId: adminUserId,
        offsetSeconds: 30 * DAY,
        idempotencyKey: crypto.randomUUID(),
      });

      await resetSandboxForOwner(tx, {
        ownerUserId: adminUserId,
        languageId,
        actorUserId: adminUserId,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(await getSandboxTimeOffset(tx, account.sandboxUserId)).toBe(0);
    });
  });

  it("resolves real server time for a user with no offset at all", async () => {
    await withTestTransaction(async (tx) => {
      const { adminUserId } = await seedSandboxFixture(tx);
      expect((await resolveUserNow(tx, adminUserId, REAL_NOW)).getTime()).toBe(
        REAL_NOW.getTime(),
      );
    });
  });

  it("refuses an offset on a real user — the database, not the application, is the guard", async () => {
    await withTestTransaction(async (tx) => {
      const { otherLearnerId } = await seedSandboxFixture(tx);
      // `users_sandbox_time_offset_consistency` makes this unrepresentable,
      // so even a wrong caller cannot shift a real learner's clock.
      await expect(
        setSandboxTimeOffset(tx, otherLearnerId, DAY),
      ).rejects.toThrow();
    });
  });

  it("keeps the sandbox persona a real user row with no Clerk identity", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, adminUserId } = await seedSandboxFixture(tx);
      const account = await getOrCreateSandbox(tx, adminUserId, languageId);
      const [row] = await tx
        .select()
        .from(users)
        .where(eq(users.id, account.sandboxUserId));
      expect(row.isSandbox).toBe(true);
      expect(row.clerkUserId).toBeNull();
      expect(row.sandboxOwnerUserId).toBe(adminUserId);
    });
  });
});
