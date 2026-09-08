import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { users } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { completeOnboarding, findUserById } from "./user-repository";
import { isOnboardingRequired } from "./onboarding";

/**
 * Spec 15's completion write against real SQL. The behaviour that matters
 * here is not "does it write" but "what happens on the second call" — the
 * spec requires repeated `Start Now!` clicks to be safe, and that guarantee
 * lives in the `IS NULL` guard on the update rather than in any client code.
 */
describe("completeOnboarding (spec 15)", () => {
  it("records a completion time for an account that has none", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await tx.update(users).set({ onboardingCompletedAt: null }).where(eq(users.id, learnerId));

      const before = await findUserById(tx, learnerId);
      expect(before && isOnboardingRequired(before)).toBe(true);

      const after = await completeOnboarding(tx, learnerId, new Date("2026-09-09T12:00:00Z"));

      expect(after?.onboardingCompletedAt).toEqual(new Date("2026-09-09T12:00:00Z"));
      expect(after && isOnboardingRequired(after)).toBe(false);
    });
  });

  it("is safe to call repeatedly — a second call never moves the recorded time", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await tx.update(users).set({ onboardingCompletedAt: null }).where(eq(users.id, learnerId));

      const first = new Date("2026-09-09T12:00:00Z");
      const later = new Date("2026-09-10T12:00:00Z");

      await completeOnboarding(tx, learnerId, first);
      const second = await completeOnboarding(tx, learnerId, later);
      const third = await completeOnboarding(tx, learnerId, later);

      // This is the real guarantee behind "repeated completion clicks are
      // safe": the original moment onboarding finished survives.
      expect(second?.onboardingCompletedAt).toEqual(first);
      expect(third?.onboardingCompletedAt).toEqual(first);
    });
  });

  it("touches only the requested account", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId } = await seedTestFixtures(tx);
      await tx.update(users).set({ onboardingCompletedAt: null });

      await completeOnboarding(tx, learnerId, new Date("2026-09-09T12:00:00Z"));

      const other = await findUserById(tx, developerId);
      expect(other?.onboardingCompletedAt).toBeNull();
    });
  });

  it("returns null for an account that does not exist rather than inventing one", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const result = await completeOnboarding(tx, "00000000-0000-0000-0000-0000000000ff", new Date());
      expect(result).toBeNull();
    });
  });
});
