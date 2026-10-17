import { randomUUID } from "node:crypto";

import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";
import { languages, userAnalyticsConsent, users } from "@/db/schema";
import { testDb } from "@/db/test/test-client";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import {
  confirmAccountDeletion,
  finalizeDueAccountDeletions,
  requestAccountDeletion,
} from "@/domains/danger-zone/account-deletion-service";
import { AppError } from "@/lib/errors/app-error";

import { ANALYTICS_POLICY_VERSION } from "./analytics-consent";
import {
  findStoredAnalyticsConsent,
  saveAcceptedConsent,
  saveDeclinedConsent,
} from "./analytics-consent-repository";
import {
  getAnalyticsConsent,
  resolveAnalyticsCaptureIdentity,
  setAnalyticsConsent,
} from "./analytics-consent-service";

/**
 * Spec 27 Unit 27.2 — analytics consent against real PostgreSQL. The rules that
 * matter here are the ones only a database can prove: that an acceptance based
 * on a stale view changes nothing, that two devices racing cannot both win,
 * that a withdrawal is seen by the very next capture check, and that deleting
 * an account takes the choice and the pseudonym with it.
 */

const OLDER_NOTICE = "2020-01-01";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function languageId(db: DbClient): Promise<string> {
  const code = "es-MX";
  const [inserted] = await db
    .insert(languages)
    .values({ code, slug: `spanish-${randomUUID()}`, name: "Spanish" })
    .onConflictDoNothing({ target: languages.code })
    .returning();
  if (inserted) return inserted.id;
  const [existing] = await db
    .select()
    .from(languages)
    .where(eq(languages.code, code))
    .limit(1);
  return existing!.id;
}

type NewUser = {
  clerkUserId?: string | null;
  isSandbox?: boolean;
  sandboxOwnerUserId?: string | null;
};

async function makeUser(db: DbClient, language: string, user: NewUser = {}) {
  const [row] = await db
    .insert(users)
    .values({
      clerkUserId:
        user.clerkUserId === undefined
          ? `clerk-consent-${randomUUID()}`
          : user.clerkUserId,
      activeLanguageId: language,
      isSandbox: user.isSandbox ?? false,
      sandboxOwnerUserId: user.sandboxOwnerUserId ?? null,
    })
    .returning();
  return row!;
}

const rowOf = async (db: DbClient, userId: string) =>
  (
    await db
      .select()
      .from(userAnalyticsConsent)
      .where(eq(userAnalyticsConsent.userId, userId))
  )[0];

/** Runs a call that must be refused, and hands back the refusal. */
async function refusal(call: () => Promise<unknown>): Promise<AppError> {
  try {
    await call();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("expected the call to be refused, but it succeeded");
}

/** The SQLSTATE and constraint a failed statement reports (Drizzle wraps the driver error in `cause`). */
async function violation(call: () => Promise<unknown>) {
  try {
    await call();
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } })
      .cause;
    return { code: cause?.code, constraint: cause?.constraint };
  }
  throw new Error("expected the statement to be refused, but it succeeded");
}

describe("a learner who has not chosen", () => {
  it("reads as unknown, and nothing may be captured about them", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));

      expect(await getAnalyticsConsent(tx, learner.id)).toEqual({
        status: "unknown",
        revision: null,
        needsReview: false,
      });
      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toBeNull();
      expect(await rowOf(tx, learner.id)).toBeUndefined();
    });
  });

  it("has no capture identity for an account that does not exist", async () => {
    await withTestTransaction(async (tx) => {
      expect(
        await resolveAnalyticsCaptureIdentity(tx, randomUUID()),
      ).toBeNull();
    });
  });
});

describe("accepting", () => {
  it("stores an acceptance for the current notice and hands the capture gate a pseudonym", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));

      const view = await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });

      expect(view).toEqual({
        status: "accepted",
        revision: 1,
        needsReview: false,
      });
      const row = await rowOf(tx, learner.id);
      expect(row).toMatchObject({
        status: "accepted",
        policyVersion: ANALYTICS_POLICY_VERSION,
        revision: 1,
      });
      expect(row!.analyticsId).toMatch(UUID);

      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toEqual({
        distinctId: row!.analyticsId,
      });
    });
  });

  it("files events under a pseudonym that is not derived from any identifier of the learner", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });

      const { analyticsId } = (await rowOf(tx, learner.id))!;
      expect(analyticsId).not.toBe(learner.id);
      expect(analyticsId).not.toBe(learner.clerkUserId);
      // A second learner's pseudonym shares nothing with the first's.
      const other = await makeUser(tx, learner.activeLanguageId);
      await setAnalyticsConsent(tx, {
        userId: other.id,
        status: "accepted",
        expectedRevision: null,
      });
      expect((await rowOf(tx, other.id))!.analyticsId).not.toBe(analyticsId);
    });
  });

  it("never returns the pseudonym through the view the Settings page reads", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      const view = await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });
      const { analyticsId } = (await rowOf(tx, learner.id))!;

      expect(JSON.stringify(view)).not.toContain(analyticsId!);
      expect(
        JSON.stringify(await getAnalyticsConsent(tx, learner.id)),
      ).not.toContain(analyticsId!);
    });
  });
});

describe("a stale view cannot overwrite a newer decision", () => {
  it("refuses an acceptance that claims nothing was stored, when something is", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });
      const before = await rowOf(tx, learner.id);

      const error = await refusal(() =>
        setAnalyticsConsent(tx, {
          userId: learner.id,
          status: "accepted",
          expectedRevision: null,
        }),
      );

      expect(error.code).toBe("STALE_SETTING");
      expect(await rowOf(tx, learner.id)).toEqual(before);
    });
  });

  it("refuses an acceptance that names a revision which is no longer the stored one", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "declined",
        expectedRevision: 1,
      });
      const before = await rowOf(tx, learner.id);

      // Revision 1 is what a device that last looked before the withdrawal holds.
      const error = await refusal(() =>
        setAnalyticsConsent(tx, {
          userId: learner.id,
          status: "accepted",
          expectedRevision: 1,
        }),
      );

      expect(error.code).toBe("STALE_SETTING");
      expect(await rowOf(tx, learner.id)).toEqual(before);
      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toBeNull();
    });
  });

  it("refuses an acceptance that names a revision that never existed, or that names one when nothing is stored", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));

      const nothingStored = await refusal(() =>
        setAnalyticsConsent(tx, {
          userId: learner.id,
          status: "accepted",
          expectedRevision: 1,
        }),
      );
      expect(nothingStored.code).toBe("STALE_SETTING");
      expect(await rowOf(tx, learner.id)).toBeUndefined();

      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });
      const invented = await refusal(() =>
        setAnalyticsConsent(tx, {
          userId: learner.id,
          status: "accepted",
          expectedRevision: 99,
        }),
      );
      expect(invented.code).toBe("STALE_SETTING");
      expect((await rowOf(tx, learner.id))!.revision).toBe(1);
    });
  });

  it("walks the two-device story end to end", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));

      // Device B opens Settings first and sees no stored choice.
      const seenByB = await getAnalyticsConsent(tx, learner.id);
      expect(seenByB.revision).toBeNull();

      // Device A accepts, then withdraws.
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "declined",
        expectedRevision: 1,
      });

      // Device B, still showing its old view, cannot turn analytics back on ...
      const stale = await refusal(() =>
        setAnalyticsConsent(tx, {
          userId: learner.id,
          status: "accepted",
          expectedRevision: seenByB.revision,
        }),
      );
      expect(stale.code).toBe("STALE_SETTING");
      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toBeNull();

      // ... but a fresh look lets it make the choice on purpose.
      const fresh = await getAnalyticsConsent(tx, learner.id);
      expect(fresh).toMatchObject({ status: "declined", revision: 2 });
      const chosen = await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: fresh.revision,
      });
      expect(chosen).toMatchObject({ status: "accepted", revision: 3 });
      expect(
        await resolveAnalyticsCaptureIdentity(tx, learner.id),
      ).not.toBeNull();
    });
  });
});

describe("withdrawing", () => {
  it("is seen by the very next capture check", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });
      expect(
        await resolveAnalyticsCaptureIdentity(tx, learner.id),
      ).not.toBeNull();

      const view = await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "declined",
        expectedRevision: 1,
      });

      expect(view).toEqual({
        status: "declined",
        revision: 2,
        needsReview: false,
      });
      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toBeNull();
    });
  });

  it("works from a stale view: stopping never needs the current revision", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });

      // A device that last saw "nothing stored", and a made-up revision.
      for (const expectedRevision of [null, 42]) {
        const view = await setAnalyticsConsent(tx, {
          userId: learner.id,
          status: "declined",
          expectedRevision,
        });
        expect(view.status).toBe("declined");
      }
      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toBeNull();
    });
  });

  it("is a true no-op when repeated: nothing about the stored row moves, not even the revision", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "declined",
        expectedRevision: 1,
      });
      const once = await rowOf(tx, learner.id);

      const again = await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "declined",
        expectedRevision: 2,
      });

      expect(again).toEqual({
        status: "declined",
        revision: 2,
        needsReview: false,
      });
      expect(await rowOf(tx, learner.id)).toEqual(once);
    });
  });

  it("keeps the pseudonym, so a later re-acceptance continues under the same id", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });
      const { analyticsId } = (await rowOf(tx, learner.id))!;

      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "declined",
        expectedRevision: 1,
      });
      expect((await rowOf(tx, learner.id))!.analyticsId).toBe(analyticsId);

      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: 2,
      });
      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toEqual({
        distinctId: analyticsId,
      });
    });
  });

  it("records a refusal made before ever accepting, without creating a pseudonym", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));

      const view = await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "declined",
        expectedRevision: null,
      });

      expect(view).toEqual({
        status: "declined",
        revision: 1,
        needsReview: false,
      });
      expect((await rowOf(tx, learner.id))!.analyticsId).toBeNull();
      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toBeNull();

      // They can still change their mind, on a current view.
      const accepted = await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: 1,
      });
      expect(accepted).toMatchObject({ status: "accepted", revision: 2 });
      expect((await rowOf(tx, learner.id))!.analyticsId).toMatch(UUID);
    });
  });
});

describe("a change of notice", () => {
  it("stops counting an acceptance given under an older notice, until the learner chooses again", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      const analyticsId = randomUUID();
      await tx.insert(userAnalyticsConsent).values({
        userId: learner.id,
        status: "accepted",
        policyVersion: OLDER_NOTICE,
        analyticsId,
        revision: 4,
      });

      expect(await getAnalyticsConsent(tx, learner.id)).toEqual({
        status: "unknown",
        revision: 4,
        needsReview: true,
      });
      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toBeNull();

      const view = await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: 4,
      });

      expect(view).toEqual({
        status: "accepted",
        revision: 5,
        needsReview: false,
      });
      expect(await findStoredAnalyticsConsent(tx, learner.id)).toMatchObject({
        policyVersion: ANALYTICS_POLICY_VERSION,
        analyticsId,
      });
      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toEqual({
        distinctId: analyticsId,
      });
    });
  });

  it("never invalidates a decline", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      await tx.insert(userAnalyticsConsent).values({
        userId: learner.id,
        status: "declined",
        policyVersion: OLDER_NOTICE,
      });

      expect(await getAnalyticsConsent(tx, learner.id)).toEqual({
        status: "declined",
        revision: 1,
        needsReview: false,
      });
    });
  });
});

describe("sandbox personas", () => {
  it("are refused, and nothing is stored for them", async () => {
    await withTestTransaction(async (tx) => {
      const language = await languageId(tx);
      const owner = await makeUser(tx, language);
      const persona = await makeUser(tx, language, {
        clerkUserId: null,
        isSandbox: true,
        sandboxOwnerUserId: owner.id,
      });

      for (const status of ["accepted", "declined"] as const) {
        const error = await refusal(() =>
          setAnalyticsConsent(tx, {
            userId: persona.id,
            status,
            expectedRevision: null,
          }),
        );
        expect(error.code).toBe("FORBIDDEN");
      }
      expect(await rowOf(tx, persona.id)).toBeUndefined();
    });
  });

  it("get no capture identity even if a row were forced in by other means", async () => {
    await withTestTransaction(async (tx) => {
      const language = await languageId(tx);
      const owner = await makeUser(tx, language);
      const persona = await makeUser(tx, language, {
        clerkUserId: null,
        isSandbox: true,
        sandboxOwnerUserId: owner.id,
      });
      await tx.insert(userAnalyticsConsent).values({
        userId: persona.id,
        status: "accepted",
        policyVersion: ANALYTICS_POLICY_VERSION,
        analyticsId: randomUUID(),
      });

      expect(await resolveAnalyticsCaptureIdentity(tx, persona.id)).toBeNull();
    });
  });

  it("do not stop the admin who owns them from choosing for themselves", async () => {
    await withTestTransaction(async (tx) => {
      const owner = await makeUser(tx, await languageId(tx));

      const view = await setAnalyticsConsent(tx, {
        userId: owner.id,
        status: "accepted",
        expectedRevision: null,
      });

      expect(view.status).toBe("accepted");
    });
  });
});

describe("an account that does not exist", () => {
  it("is refused rather than given a row", async () => {
    await withTestTransaction(async (tx) => {
      const error = await refusal(() =>
        setAnalyticsConsent(tx, {
          userId: randomUUID(),
          status: "accepted",
          expectedRevision: null,
        }),
      );
      expect(error.code).toBe("ITEM_NOT_FOUND");
    });
  });
});

describe("two accounts on one device", () => {
  it("keep entirely separate choices and pseudonyms", async () => {
    await withTestTransaction(async (tx) => {
      const language = await languageId(tx);
      const first = await makeUser(tx, language);
      const second = await makeUser(tx, language);

      await setAnalyticsConsent(tx, {
        userId: first.id,
        status: "accepted",
        expectedRevision: null,
      });

      // The second account, on the same browser, has chosen nothing.
      expect(await getAnalyticsConsent(tx, second.id)).toMatchObject({
        status: "unknown",
        revision: null,
      });
      expect(await resolveAnalyticsCaptureIdentity(tx, second.id)).toBeNull();

      await setAnalyticsConsent(tx, {
        userId: second.id,
        status: "declined",
        expectedRevision: null,
      });
      await setAnalyticsConsent(tx, {
        userId: first.id,
        status: "declined",
        expectedRevision: 1,
      });

      // Each account's changes moved only its own revision.
      expect((await rowOf(tx, first.id))!.revision).toBe(2);
      expect((await rowOf(tx, second.id))!.revision).toBe(1);
    });
  });
});

describe("the database as a backstop", () => {
  it("refuses an acceptance with no pseudonym", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      const failure = await violation(() =>
        tx.insert(userAnalyticsConsent).values({
          userId: learner.id,
          status: "accepted",
          policyVersion: ANALYTICS_POLICY_VERSION,
          analyticsId: null,
        }),
      );
      expect(failure).toEqual({
        code: "23514",
        constraint: "user_analytics_consent_accepted_has_id",
      });
    });
  });

  it("refuses a revision below one", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      const failure = await violation(() =>
        tx.insert(userAnalyticsConsent).values({
          userId: learner.id,
          status: "declined",
          policyVersion: ANALYTICS_POLICY_VERSION,
          revision: 0,
        }),
      );
      expect(failure).toEqual({
        code: "23514",
        constraint: "user_analytics_consent_revision_positive",
      });
    });
  });

  it("never gives two accounts the same pseudonym", async () => {
    await withTestTransaction(async (tx) => {
      const language = await languageId(tx);
      const first = await makeUser(tx, language);
      const second = await makeUser(tx, language);
      const shared = randomUUID();
      await tx.insert(userAnalyticsConsent).values({
        userId: first.id,
        status: "accepted",
        policyVersion: ANALYTICS_POLICY_VERSION,
        analyticsId: shared,
      });

      const failure = await violation(() =>
        tx.insert(userAnalyticsConsent).values({
          userId: second.id,
          status: "accepted",
          policyVersion: ANALYTICS_POLICY_VERSION,
          analyticsId: shared,
        }),
      );
      expect(failure.code).toBe("23505");
    });
  });
});

describe("deleting an account (spec 20 Permanent Account Deletion)", () => {
  it("takes the choice and the pseudonym with it, and nothing about analytics can stop it", async () => {
    await withTestTransaction(async (tx) => {
      const learner = await makeUser(tx, await languageId(tx));
      await setAnalyticsConsent(tx, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: null,
      });
      expect(await rowOf(tx, learner.id)).toBeDefined();

      const now = new Date("2026-08-01T00:00:00Z");
      await requestAccountDeletion(tx, { userId: learner.id, now });
      const { deleteAfter } = await confirmAccountDeletion(tx, {
        userId: learner.id,
        now,
      });
      const deleteClerkUser = vi.fn(async () => {});
      const result = await finalizeDueAccountDeletions(tx, {
        now: new Date(deleteAfter.getTime() + 1000),
        deleteClerkUser,
      });

      expect(result).toEqual({ processedCount: 1, failedCount: 0 });
      expect(
        await tx.select().from(users).where(eq(users.id, learner.id)),
      ).toHaveLength(0);
      // Gone: the stored choice, and with it the only link between the account
      // and anything already sent under its pseudonym.
      expect(await rowOf(tx, learner.id)).toBeUndefined();
      expect(await resolveAnalyticsCaptureIdentity(tx, learner.id)).toBeNull();
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Concurrency: real, independently-committed transactions                    */
/* -------------------------------------------------------------------------- */

/**
 * The rolled-back harness cannot produce two requests at once, so these tests
 * commit real rows (unique to each test) and remove them afterwards. A run that
 * is killed leaves them behind, so they are cleared before and after, by the one
 * pattern their users share.
 */
async function purgeLeftovers() {
  await testDb.delete(users).where(like(users.clerkUserId, "clerk-consent-%"));
}

describe("racing devices (real transactions)", () => {
  beforeAll(purgeLeftovers);
  afterAll(purgeLeftovers);

  it("lets exactly one of two simultaneous first acceptances win", async () => {
    const learner = await makeUser(testDb, await languageId(testDb));

    const results = await Promise.all([
      saveAcceptedConsent(testDb, {
        userId: learner.id,
        policyVersion: ANALYTICS_POLICY_VERSION,
        expectedRevision: null,
      }),
      saveAcceptedConsent(testDb, {
        userId: learner.id,
        policyVersion: ANALYTICS_POLICY_VERSION,
        expectedRevision: null,
      }),
    ]);

    expect(results.filter((result) => result.saved)).toHaveLength(1);
    expect(results.filter((result) => !result.saved)).toHaveLength(1);
    const row = await rowOf(testDb, learner.id);
    expect(row).toMatchObject({ status: "accepted", revision: 1 });
    expect(row!.analyticsId).toMatch(UUID);
  });

  it("lets exactly one of two simultaneous changes based on the same revision win", async () => {
    const learner = await makeUser(testDb, await languageId(testDb));
    await saveDeclinedConsent(testDb, {
      userId: learner.id,
      policyVersion: ANALYTICS_POLICY_VERSION,
    });

    const results = await Promise.all([
      saveAcceptedConsent(testDb, {
        userId: learner.id,
        policyVersion: ANALYTICS_POLICY_VERSION,
        expectedRevision: 1,
      }),
      saveAcceptedConsent(testDb, {
        userId: learner.id,
        policyVersion: ANALYTICS_POLICY_VERSION,
        expectedRevision: 1,
      }),
    ]);

    expect(results.filter((result) => result.saved)).toHaveLength(1);
    const row = await rowOf(testDb, learner.id);
    expect(row).toMatchObject({ status: "accepted", revision: 2 });
  });

  it("ends a withdrawal racing an acceptance in one coherent state, whichever lands last", async () => {
    const learner = await makeUser(testDb, await languageId(testDb));
    await setAnalyticsConsent(testDb, {
      userId: learner.id,
      status: "accepted",
      expectedRevision: null,
    });
    await setAnalyticsConsent(testDb, {
      userId: learner.id,
      status: "declined",
      expectedRevision: 1,
    });
    const { analyticsId } = (await rowOf(testDb, learner.id))!;

    await Promise.allSettled([
      setAnalyticsConsent(testDb, {
        userId: learner.id,
        status: "accepted",
        expectedRevision: 2,
      }),
      setAnalyticsConsent(testDb, {
        userId: learner.id,
        status: "declined",
        expectedRevision: 2,
      }),
    ]);

    const row = (await rowOf(testDb, learner.id))!;
    // The pseudonym never changes, an acceptance always has one (a database
    // check), and the gate agrees with the row.
    expect(row.analyticsId).toBe(analyticsId);
    expect(["accepted", "declined"]).toContain(row.status);
    expect(await resolveAnalyticsCaptureIdentity(testDb, learner.id)).toEqual(
      row.status === "accepted" ? { distinctId: analyticsId } : null,
    );
  });

  it("shows a withdrawal committed on one connection to the next capture check on another", async () => {
    const learner = await makeUser(testDb, await languageId(testDb));
    await setAnalyticsConsent(testDb, {
      userId: learner.id,
      status: "accepted",
      expectedRevision: null,
    });
    expect(
      await resolveAnalyticsCaptureIdentity(testDb, learner.id),
    ).not.toBeNull();

    await setAnalyticsConsent(testDb, {
      userId: learner.id,
      status: "declined",
      expectedRevision: 1,
    });

    expect(
      await resolveAnalyticsCaptureIdentity(testDb, learner.id),
    ).toBeNull();
  });
});
