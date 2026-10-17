import { and, eq, ne, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { userAnalyticsConsent, users } from "@/db/schema";

import type { StoredAnalyticsConsent } from "./analytics-consent";

/** Explicit columns, never `SELECT *` (code-standards.md). */
const storedColumns = {
  status: userAnalyticsConsent.status,
  policyVersion: userAnalyticsConsent.policyVersion,
  analyticsId: userAnalyticsConsent.analyticsId,
  revision: userAnalyticsConsent.revision,
};

/** This learner's stored choice, or `null` when they have never made one. */
export async function findStoredAnalyticsConsent(
  db: DbClient,
  userId: string,
): Promise<StoredAnalyticsConsent | null> {
  const [row] = await db
    .select(storedColumns)
    .from(userAnalyticsConsent)
    .where(eq(userAnalyticsConsent.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * The stored choice as the capture gate needs it: read fresh on every call,
 * and never for a sandbox persona. A persona is a testing fixture, not a
 * learner — its traffic must never reach product analytics — and no write path
 * will create a row for one, so this exclusion is a second lock on a door that
 * should already be shut.
 */
export async function findCaptureConsent(
  db: DbClient,
  userId: string,
): Promise<StoredAnalyticsConsent | null> {
  const [row] = await db
    .select(storedColumns)
    .from(userAnalyticsConsent)
    .innerJoin(users, eq(users.id, userAnalyticsConsent.userId))
    .where(
      and(eq(userAnalyticsConsent.userId, userId), eq(users.isSandbox, false)),
    )
    .limit(1);
  return row ?? null;
}

/** Whether this account is a sandbox persona, or `null` when it does not exist. */
export async function isSandboxAccount(
  db: DbClient,
  userId: string,
): Promise<boolean | null> {
  const [row] = await db
    .select({ isSandbox: users.isSandbox })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ? row.isSandbox : null;
}

export type SaveAcceptedResult =
  { saved: true; consent: StoredAnalyticsConsent } | { saved: false };

/**
 * Records an acceptance — only if the caller's picture of the stored choice is
 * still true. The check and the write are one statement, so two devices racing
 * on the same revision cannot both win and a delayed request from a device that
 * has since been overtaken changes nothing:
 *
 * - `expectedRevision: null` means "this learner has never chosen". It inserts,
 *   and does nothing if a row appeared meanwhile.
 * - A number means "my last view had this revision". It updates only a row that
 *   still has it.
 *
 * The pseudonym is created by the database the first time it is needed and
 * kept ever after (`coalesce`): accepting, withdrawing and accepting again files
 * a learner's events under the same id.
 */
export async function saveAcceptedConsent(
  db: DbClient,
  input: {
    userId: string;
    policyVersion: string;
    expectedRevision: number | null;
  },
): Promise<SaveAcceptedResult> {
  if (input.expectedRevision === null) {
    const [row] = await db
      .insert(userAnalyticsConsent)
      .values({
        userId: input.userId,
        status: "accepted",
        policyVersion: input.policyVersion,
        analyticsId: sql`gen_random_uuid()`,
      })
      .onConflictDoNothing({ target: userAnalyticsConsent.userId })
      .returning(storedColumns);
    return row ? { saved: true, consent: row } : { saved: false };
  }

  const [row] = await db
    .update(userAnalyticsConsent)
    .set({
      status: "accepted",
      policyVersion: input.policyVersion,
      analyticsId: sql`coalesce(${userAnalyticsConsent.analyticsId}, gen_random_uuid())`,
      revision: sql`${userAnalyticsConsent.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userAnalyticsConsent.userId, input.userId),
        eq(userAnalyticsConsent.revision, input.expectedRevision),
      ),
    )
    .returning(storedColumns);
  return row ? { saved: true, consent: row } : { saved: false };
}

/**
 * Records a withdrawal or a refusal. Unlike an acceptance it needs no revision:
 * "stop" must work from a stale page too, and applying it twice is harmless.
 * An already-declined choice is left exactly as it was — not even the revision
 * moves — so a repeated or replayed decline is a true no-op.
 *
 * The pseudonym is kept (a withdrawal does not erase what was already sent, and
 * a later re-acceptance continues under the same id).
 */
export async function saveDeclinedConsent(
  db: DbClient,
  input: { userId: string; policyVersion: string },
): Promise<StoredAnalyticsConsent | null> {
  const [changed] = await db
    .insert(userAnalyticsConsent)
    .values({
      userId: input.userId,
      status: "declined",
      policyVersion: input.policyVersion,
    })
    .onConflictDoUpdate({
      target: userAnalyticsConsent.userId,
      set: {
        status: "declined",
        policyVersion: input.policyVersion,
        revision: sql`${userAnalyticsConsent.revision} + 1`,
        updatedAt: new Date(),
      },
      setWhere: ne(userAnalyticsConsent.status, "declined"),
    })
    .returning(storedColumns);
  return changed ?? (await findStoredAnalyticsConsent(db, input.userId));
}
