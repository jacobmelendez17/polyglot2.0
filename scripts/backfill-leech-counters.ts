import { config } from "dotenv";

// Runs as a standalone `tsx` CLI, outside Next.js's own env loading — load
// .env.local the same way the other scripts in this directory do.
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, asc, eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import { reviewEvents, userItemProgress } from "@/db/schema";
import { SRS_STAGE_ORDER } from "@/domains/srs";
import type { SrsStage } from "@/domains/srs";

/**
 * One-time backfill for spec 20 Leeches' `currentCorrectStreak`/
 * `highestSrsStageReached` (`npm run leech:backfill`), run once against real
 * data immediately after the unit 17 migration adds the columns (both
 * default to a freshly-enrolled item's state — 0 / `beginner_1` — which is
 * wrong for any item with real review history). Uses `review_events`
 * ("Current durable review history may be used to initialize
 * currentCorrectStreak/highestSrsStageReached... Do not fabricate review
 * history") — never invents activity a row doesn't actually have.
 *
 * For each `user_item_progress` row, walks that item's `review_events` in
 * chronological order: `highestSrsStageReached` is the highest of the
 * item's current stage and every `stageAfter`/`stageBefore` ever recorded;
 * `currentCorrectStreak` is the number of consecutive "advanced" events
 * trailing the most recent "penalized" one (0 if the item has ever had a
 * penalized event and none since, unbounded if it never has).
 *
 * Safe to run more than once — every row is recomputed from the same
 * durable history each time, never incremented relative to its prior value.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required. Set it in .env.local.");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  const progressRows = await db.select().from(userItemProgress);
  console.log(
    `Backfilling ${progressRows.length} user_item_progress row(s)...`,
  );

  let updated = 0;
  for (const progress of progressRows) {
    const events = await db
      .select({
        stageBefore: reviewEvents.stageBefore,
        stageAfter: reviewEvents.stageAfter,
        result: reviewEvents.result,
      })
      .from(reviewEvents)
      .where(eq(reviewEvents.learningItemId, progress.learningItemId))
      .orderBy(asc(reviewEvents.reviewedAt));

    let highestSrsStageReached: SrsStage = progress.srsStage;
    let currentCorrectStreak = 0;

    for (const event of events) {
      if (
        getStageIndex(event.stageBefore) > getStageIndex(highestSrsStageReached)
      )
        highestSrsStageReached = event.stageBefore;
      if (
        getStageIndex(event.stageAfter) > getStageIndex(highestSrsStageReached)
      )
        highestSrsStageReached = event.stageAfter;
      currentCorrectStreak =
        event.result === "advanced" ? currentCorrectStreak + 1 : 0;
    }

    await db
      .update(userItemProgress)
      .set({ currentCorrectStreak, highestSrsStageReached })
      .where(
        and(
          eq(userItemProgress.userId, progress.userId),
          eq(userItemProgress.learningItemId, progress.learningItemId),
        ),
      );
    updated += 1;
    console.log(
      `  user=${progress.userId} item=${progress.learningItemId}: currentCorrectStreak=${currentCorrectStreak}, highestSrsStageReached=${highestSrsStageReached} (from ${events.length} review event(s))`,
    );
  }

  console.log(`Done. Updated ${updated} row(s).`);
  await pool.end();
}

function getStageIndex(stage: SrsStage): number {
  return SRS_STAGE_ORDER.indexOf(stage);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
